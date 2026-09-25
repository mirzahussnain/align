import 'server-only';

import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

/** Lightweight object-storage reachability check used only by cached admin health. */
export async function checkObjectStorageReachability(): Promise<boolean> {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const buckets = [
    process.env.S3_BUCKET_UPLOADS?.trim(),
    process.env.S3_BUCKET_REWRITES?.trim(),
    process.env.S3_BUCKET_AVATARS?.trim(),
  ];
  if (!endpoint || !accessKeyId || !secretAccessKey || buckets.some((bucket) => !bucket)) return false;

  const client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    await Promise.all(
      buckets.map((bucket) => client.send(new HeadBucketCommand({ Bucket: bucket! })))
    );
    return true;
  } finally {
    client.destroy();
  }
}
