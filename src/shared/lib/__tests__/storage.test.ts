import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), getSignedUrl: vi.fn() }));

vi.mock('@aws-sdk/client-s3', async (load) => {
  const actual = await load<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: vi.fn(function S3ClientMock() { return { send: mocks.send }; }),
  };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mocks.getSignedUrl }));

describe('object storage direct uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_ACCESS_KEY_ID = 'key';
    process.env.S3_SECRET_ACCESS_KEY = 'secret';
    process.env.S3_BUCKET_UPLOADS = 'private-uploads';
    mocks.getSignedUrl.mockResolvedValue('https://signed.test/upload');
  });

  it('signs an exact five-minute PUT for the private uploads bucket', async () => {
    const { storage } = await import('@/shared/lib/storage');
    const url = await storage.createUploadUrl({
      key: 'users/user-1/stored-cv/intents/random.pdf',
      contentType: 'application/pdf',
      contentLength: 1234,
    });

    expect(url).toBe('https://signed.test/upload');
    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ input: {
        Bucket: 'private-uploads',
        Key: 'users/user-1/stored-cv/intents/random.pdf',
        ContentType: 'application/pdf',
        ContentLength: 1234,
      } }),
      { expiresIn: 300 }
    );
  });

  it('stats only the exact object key in the uploads bucket', async () => {
    mocks.send.mockResolvedValue({ ContentLength: 321, ContentType: 'application/pdf', ETag: 'etag' });
    const { storage } = await import('@/shared/lib/storage');

    await expect(storage.stat('users/user-1/stored-cv/intents/random.pdf')).resolves.toEqual({
      sizeBytes: 321,
      contentType: 'application/pdf',
      etag: 'etag',
    });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ input: {
      Bucket: 'private-uploads',
      Key: 'users/user-1/stored-cv/intents/random.pdf',
    } }));
  });
});
