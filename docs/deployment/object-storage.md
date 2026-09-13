# Object storage deployment

Keep the uploads and rewrites buckets private. Browser uploads use a five-minute presigned PUT URL and the application validates the stored object before creating a Stored CV.

Community MinIO applies CORS at server level through MINIO_API_CORS_ALLOW_ORIGIN; Docker Compose permits only http://localhost:3000 and http://127.0.0.1:3000. Authentication and presigned URLs still protect every private bucket.

For production, apply [r2-uploads-cors.json](./r2-uploads-cors.json) only to S3_BUCKET_UPLOADS with npx wrangler r2 bucket cors set <bucket> --file docs/deployment/r2-uploads-cors.json. The rule permits only https://align.vyndra.tech, PUT, and Content-Type; it does not grant public reads.