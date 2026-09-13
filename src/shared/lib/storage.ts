import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Object storage, spoken as S3.
 *
 * Cloudflare R2 and MinIO both expose the same S3 API, so there is exactly one
 * implementation here and the "provider" is nothing more than a different set of
 * environment variables. Local development points at the docker-compose MinIO
 * container; staging and production point at R2. Nothing above this file knows
 * which one it is talking to.
 *
 * The three practical differences between the two are all config, not code:
 *
 *   endpoint    R2 is https://<account>.r2.cloudflarestorage.com; MinIO is a
 *               plain host:port.
 *   region      R2 only accepts 'auto'; MinIO ignores it but the SDK demands
 *               that something be set, so local uses 'us-east-1'.
 *   path style  MinIO addresses buckets as <endpoint>/<bucket>/<key>. R2 (like
 *               S3 proper) uses virtual-host addressing. Hence the flag.
 */

/**
 * Storage is split into three buckets so the two private ones (raw CV uploads
 * and generated CVs, both full of PII) stay isolated from the public-read avatar
 * bucket that gets served straight off a CDN. Credentials are shared; only the
 * bucket name differs per target.
 */
export type StorageBucket = 'uploads' | 'rewrites' | 'avatars';

export interface UploadParams {
  bucket: StorageBucket;
  key: string;
  body: Buffer;
  contentType: string;
}

export interface ObjectStorage {
  upload(params: UploadParams): Promise<string>;
  createUploadUrl(params: { key: string; contentType: string; contentLength: number }): Promise<string>;
  stat(key: string): Promise<{ sizeBytes: number; contentType: string | null; etag: string | null }>;
  download(bucket: StorageBucket, key: string): Promise<Buffer>;
  delete(bucket: StorageBucket, key: string): Promise<boolean>;
  createSignedUrl(bucket: StorageBucket, key: string, expiresInSeconds?: number): Promise<string>;
  publicUrl(key: string): string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Thrown lazily, on first use rather than at import, so a missing variable
    // surfaces as a clear error on the request that needed storage instead of
    // taking down the whole build.
    throw new Error(
      `[storage] ${name} is not set. Local development expects the MinIO block ` +
        `from .env.example; production expects the R2 block.`
    );
  }
  return value;
}

const BUCKET_ENV: Record<StorageBucket, string> = {
  uploads: 'S3_BUCKET_UPLOADS',
  rewrites: 'S3_BUCKET_REWRITES',
  avatars: 'S3_BUCKET_AVATARS',
};

function bucketName(bucket: StorageBucket): string {
  return required(BUCKET_ENV[bucket]);
}

// Built once and reused: each S3Client owns a connection pool, and constructing
// one per request leaks sockets under load.
let cachedClient: S3Client | undefined;

function getClient(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: required('S3_ENDPOINT'),
      // MinIO cannot do virtual-host buckets without wildcard DNS, so local runs
      // with this on. R2 leaves it off.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: required('S3_ACCESS_KEY_ID'),
        secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
      },
    });
  }
  return cachedClient;
}

const s3Storage: ObjectStorage = {
  async upload({ bucket, key, body, contentType }) {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucketName(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    return key;
  },

  async createUploadUrl({ key, contentType, contentLength }) {
    return getSignedUrl(
      getClient(),
      new PutObjectCommand({
        Bucket: bucketName('uploads'),
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      { expiresIn: 300 }
    );
  },

  async stat(key) {
    const result = await getClient().send(
      new HeadObjectCommand({ Bucket: bucketName('uploads'), Key: key })
    );
    return {
      sizeBytes: result.ContentLength ?? 0,
      contentType: result.ContentType ?? null,
      etag: result.ETag ?? null,
    };
  },

  async download(bucket, key) {
    const result = await getClient().send(
      new GetObjectCommand({ Bucket: bucketName(bucket), Key: key })
    );
    if (!result.Body) {
      throw new Error(`[storage] ${bucket}/${key} returned an empty body.`);
    }
    return Buffer.from(await result.Body.transformToByteArray());
  },

  /**
   * Remove an object. Used by quota pruning and retention expiry, where the DB
   * row outlives the file. Never throws: a delete that fails (already gone,
   * transient provider error) must not break the request that triggered it —
   * the worst case is an orphaned object, which the next sweep will retry.
   */
  async delete(bucket, key) {
    try {
      await getClient().send(
        new DeleteObjectCommand({ Bucket: bucketName(bucket), Key: key })
      );
      return true;
    } catch (error) {
      console.warn(
        `[storage] Failed to delete ${bucket}/${key}:`,
        error instanceof Error ? error.message : error
      );
      return false;
    }
  },

  /**
   * Short-lived download URL for a private object (uploads / rewrites). Avatars
   * are public — use publicUrl for those instead.
   */
  async createSignedUrl(bucket, key, expiresInSeconds = 3600) {
    return getSignedUrl(
      getClient(),
      new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }),
      { expiresIn: expiresInSeconds }
    );
  },

  /**
   * Direct URL for a public avatar object. Configured rather than derived,
   * because the two providers disagree on shape: R2 serves avatars from a custom
   * domain or *.r2.dev, while MinIO serves them from <endpoint>/<bucket>.
   */
  publicUrl(key) {
    const base = required('S3_PUBLIC_URL_AVATARS').replace(/\/$/, '');
    return `${base}/${key}`;
  },
};

export const storage = s3Storage;

// Strip path separators and control chars so a user-supplied file name can't
// escape its intended prefix or inject an unexpected folder into the key.
function sanitizeFileName(fileName: string): string {
  return (fileName || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

/**
 * Object-key builders. Keys are namespaced per user so everything for one user
 * can be listed/deleted under a single `users/{userId}/` (or `avatars/{userId}/`)
 * prefix. Slashes are virtual folders — the buckets themselves stay flat.
 */
export const keyFor = {
  upload: (userId: string, analysisId: string, fileName: string) =>
    `users/${userId}/${analysisId}/${sanitizeFileName(fileName)}`,
  rewrite: (userId: string, generatedCvId: string, fileName: string) =>
    `users/${userId}/${generatedCvId}/${sanitizeFileName(fileName)}`,
  avatar: (userId: string, fileName: string) =>
    `avatars/${userId}/${sanitizeFileName(fileName)}`,
};
