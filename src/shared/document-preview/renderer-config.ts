import 'server-only';

export const DOCUMENT_RENDERER_VERSION = '8.38.1';
export const DOCUMENT_RENDERER_TIMEOUT_MS = 50_000;

export class RendererConfigurationError extends Error {
  readonly code = 'RENDERER_UNAVAILABLE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'RendererConfigurationError';
  }
}

export interface DocumentRendererConfig {
  enabled: boolean;
  baseUrl: URL;
  username: string;
  password: string;
  rendererVersion: string;
  imageDigest: string;
  timeoutMs: 50_000;
}

const publicRendererVariables = [
  'NEXT_PUBLIC_GOTENBERG_URL',
  'NEXT_PUBLIC_GOTENBERG_USERNAME',
  'NEXT_PUBLIC_GOTENBERG_PASSWORD',
  'NEXT_PUBLIC_GOTENBERG_EXPECTED_VERSION',
  'NEXT_PUBLIC_GOTENBERG_IMAGE_DIGEST',
] as const;

function unavailable(message: string): never {
  throw new RendererConfigurationError(message);
}

export function rendererConfig(
  environment: NodeJS.ProcessEnv = process.env,
): DocumentRendererConfig {
  for (const name of publicRendererVariables) {
    if (environment[name]?.trim()) {
      unavailable(`${name} must never contain document-renderer configuration`);
    }
  }

  const enabledValue = environment.DOCUMENT_RENDERER_ENABLED?.trim();
  if (enabledValue && enabledValue !== 'true' && enabledValue !== 'false') {
    unavailable('DOCUMENT_RENDERER_ENABLED must be true or false');
  }
  const enabled = enabledValue === 'true';
  const fallbackUrl = 'http://127.0.0.1:3001';
  const rawUrl = environment.GOTENBERG_URL?.trim() || fallbackUrl;
  let baseUrl: URL;
  try {
    baseUrl = new URL(rawUrl);
  } catch {
    unavailable('GOTENBERG_URL must be an absolute URL');
  }

  const username = environment.GOTENBERG_USERNAME?.trim() ?? '';
  const password = environment.GOTENBERG_PASSWORD?.trim() ?? '';
  const rendererVersion = environment.GOTENBERG_EXPECTED_VERSION?.trim() ?? '';
  const imageDigest = environment.GOTENBERG_IMAGE_DIGEST?.trim() ?? '';

  if (enabled) {
    const missing = [
      ['GOTENBERG_URL', environment.GOTENBERG_URL?.trim()],
      ['GOTENBERG_USERNAME', username],
      ['GOTENBERG_PASSWORD', password],
      ['GOTENBERG_EXPECTED_VERSION', rendererVersion],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (environment.NODE_ENV === 'production' && !imageDigest) {
      missing.push('GOTENBERG_IMAGE_DIGEST');
    }
    if (missing.length) unavailable(`${missing.join(', ')} required when document rendering is enabled`);
    if (baseUrl.username || baseUrl.password) {
      unavailable('GOTENBERG_URL must not contain credentials');
    }
    if (!['http:', 'https:'].includes(baseUrl.protocol)) {
      unavailable('GOTENBERG_URL must use http:// or https://');
    }
    if (environment.NODE_ENV === 'production' && baseUrl.protocol !== 'https:') {
      unavailable('GOTENBERG_URL must use https:// in production');
    }
    if (rendererVersion !== DOCUMENT_RENDERER_VERSION) {
      unavailable(`GOTENBERG_EXPECTED_VERSION must be ${DOCUMENT_RENDERER_VERSION}`);
    }
    if (
      environment.NODE_ENV === 'production' &&
      !/^sha256:[a-f0-9]{64}$/iu.test(imageDigest)
    ) {
      unavailable('GOTENBERG_IMAGE_DIGEST must be a sha256 registry digest');
    }
  }

  return {
    enabled,
    baseUrl,
    username,
    password,
    rendererVersion,
    imageDigest,
    timeoutMs: DOCUMENT_RENDERER_TIMEOUT_MS,
  };
}
