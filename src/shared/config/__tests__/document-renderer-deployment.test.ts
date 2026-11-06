import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../../../next.config';

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const digest = 'sha256:2098722190575dbd975d8abf02e4ce83ffe20783114c5cc56f1b2ac309e6a083';

describe('document renderer deployment contract', () => {
  it('pins the real-render-tested image and documents independent protected deployment', () => {
    const runbook = read('docs/deployment/document-renderer.md');
    expect(read('docker/gotenberg/Dockerfile')).toContain(digest);
    expect(runbook).toContain(`gotenberg/gotenberg:8.38.1-libreoffice@${digest}`);
    for (const value of [
      'DOCUMENT_RENDERER_ENABLED', 'GOTENBERG_URL', 'GOTENBERG_USERNAME',
      'GOTENBERG_PASSWORD', 'GOTENBERG_EXPECTED_VERSION', 'GOTENBERG_IMAGE_DIGEST',
      'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET',
      'https://align-pdf-renderer.vyndra.tech', 'Cloudflare Access', 'service token',
      'Arial', 'Georgia', 'Trebuchet MS', 'Times New Roman',
      'HTTPS', 'Basic Auth', 'Caddy', 'dynamic egress', 'secret rotation',
    ]) expect(runbook).toContain(value);
    expect(runbook).toMatch(/never.*unauthenticated|unauthenticated.*denied/iu);
  });

  it('documents bounded resources, timeout layers, monitoring, and failure gates', () => {
    const runbook = read('docs/deployment/document-renderer.md');
    for (const value of [
      '1 vCPU', '2 GiB', 'one active conversion', 'queue size 4', '10 MiB',
      '45 seconds', '50 seconds', '260 seconds', '300 seconds',
      'one workflow-scoped retry', 'OOM', 'queue', 'latency', 'without PII',
      'Microsoft Word', 'LibreOffice', 'verified PDF',
    ]) expect(runbook).toContain(value);
    expect(runbook).toMatch(/DOCUMENT_RENDERER_ENABLED=false/);
  });

  it('states the honest zero-budget Oracle gate without a paid fallback', () => {
    const runbook = read('docs/deployment/document-renderer.md');
    const status = read('docs/PROJECT_STATUS.md');
    for (const value of [
      'Oracle Cloud Always Free', 'VM.Standard.A1.Flex', 'home region',
      '2 OCPU', '12 GiB', 'out of host capacity', 'idle reclamation',
      'account verification', 'NSG', 'DNS', 'TLS', '£0', 'no paid fallback',
    ]) expect(runbook).toContain(value);
    expect(status).toMatch(/production document generation remains disabled/iu);
    expect(status).toMatch(/Oracle.*capacity/iu);
  });

  it('keeps preview storage private and account cleanup explicit', () => {
    const storage = read('docs/deployment/object-storage.md');
    for (const value of [
      'users/{userId}/{generatedCvId}/previews/{documentHash}/document.pdf',
      'page-1.png', 'page-2.png', 'authenticated', 'account deletion',
    ]) expect(storage).toContain(value);
    expect(storage).toMatch(/never public|no public/iu);
  });

  it('provides a safe renderer smoke command', () => {
    const source = read('scripts/check-document-renderer.mts');
    const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(packageJson.scripts['check:renderer']).toContain('check-document-renderer.mts');
    expect(source).toContain('createSafeTemplateSample');
    expect(source).toMatch(/unauthenticated/iu);
    expect(source).toContain('DOCUMENT_RENDERER_VERSION');
    expect(source).toContain('rendererRequestInit');
    expect(source).toContain('Arial');
    expect(source).toContain('Times New Roman');
    expect(source).not.toMatch(/console\.(log|error)\([^)]*(password|pdf|docx)/iu);
  });

  it('keeps the Node PDF runtime outside the Next.js server bundle', () => {
    const nextConfig = read('next.config.ts');
    for (const packageName of ['@napi-rs/canvas', 'unpdf', 'pdfjs-dist']) {
      expect(nextConfig).toContain(`'${packageName}'`);
    }
  });

  it('traces the PDF.js font assets needed to validate generated CV pages', () => {
    const includes = nextConfig.outputFileTracingIncludes as Record<string, string[]>;
    const requiredAssets = [
      'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      'node_modules/pdfjs-dist/standard_fonts/**/*',
      'node_modules/pdfjs-dist/cmaps/**/*',
    ];

    expect(includes['/api/cv-generations/*/generate']).toEqual(requiredAssets);
    expect(includes['/api/cv/*/preview']).toEqual(requiredAssets);
  });
});
