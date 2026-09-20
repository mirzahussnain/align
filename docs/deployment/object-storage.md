# Object storage deployment

This is the focused storage runbook. See [Production deployment](../DEPLOYMENT.md) for the complete environment and release contract.

Align uses three S3-compatible buckets:

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `S3_BUCKET_UPLOADS` | Private | Raw CV uploads and upload-intent finalisation |
| `S3_BUCKET_REWRITES` | Private | Generated and tailored CV documents |
| `S3_BUCKET_AVATARS` | Public read | Browser-loaded user avatars |

Keep the uploads and rewrites buckets private. Browser uploads use a five-minute presigned PUT URL and the application validates ownership, expected size, object metadata, file signature, and upload-intent state before creating a Stored CV.

Community MinIO applies CORS at server level through MINIO_API_CORS_ALLOW_ORIGIN; Docker Compose permits only http://localhost:3000 and http://127.0.0.1:3000. Authentication and presigned URLs still protect every private bucket.

For production, first confirm that [r2-uploads-cors.json](./r2-uploads-cors.json) contains the deployed application origin. Apply it only to `S3_BUCKET_UPLOADS`:

```bash
npx wrangler r2 bucket cors set align-cv-uploads --file docs/deployment/r2-uploads-cors.json
```

The rule permits only `https://align.vyndra.tech`, `PUT`, and `Content-Type`; it does not grant public reads.

After configuration, run:

```bash
npm run check:env
npm run check:env:live
```

The live probe confirms credentials and bucket existence, verifies that unsigned private reads fail, verifies that avatar reads succeed, and deletes its probe objects.
