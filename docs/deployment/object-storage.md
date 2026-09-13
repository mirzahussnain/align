# Object storage deployment

Keep the uploads and rewrites buckets private. Browser uploads use a five-minute presigned PUT URL and the application validates the stored object before creating a Stored CV.

Local MinIO applies [minio-cors.xml](../../docker/minio-cors.xml) when `docker compose up` runs. For production, apply [r2-uploads-cors.json](./r2-uploads-cors.json) only to `S3_BUCKET_UPLOADS` with `npx wrangler r2 bucket cors set <bucket> --file docs/deployment/r2-uploads-cors.json`.

The production rule permits only `https://align.vyndra.tech`, `PUT`, and `Content-Type`; it does not grant public reads. Add preview origins as separate explicit rules rather than using a wildcard.
