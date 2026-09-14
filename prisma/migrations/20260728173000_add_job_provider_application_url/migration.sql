-- Preserve the provider-hosted vacancy page and its separately validated
-- application link. The latter may be absent when it was unsafe to retain.
ALTER TABLE "job_provider_reference" ADD COLUMN "applicationUrl" TEXT;
