/**
 * Resolve the `@/…` path alias for scripts run directly on Node.
 *
 * The application is bundled by Next, which reads the alias from `tsconfig.json`.
 * A `.mts` script executed with `--experimental-strip-types` gets no bundler, so
 * any module it pulls in that imports through the alias fails to resolve — which
 * is why the maintenance commands previously had to avoid touching aliased code
 * at all, and why a shared classifier could not be reused from one.
 *
 * `registerHooks` is the synchronous, in-thread resolver hook API, so this needs
 * no worker and no separate loader process. It only rewrites the alias prefix and
 * appends the `.ts`/`.tsx` extension Node's ESM resolver requires; everything
 * else is handed straight back to the default resolver.
 *
 * Usage: `node --import ./scripts/register-alias.mts script.mts`
 */

// `registerHooks` is Node >= 22.15 / 24. The bundled @types/node in this repo
// predates it, so it is read off the module namespace rather than imported by
// name; the shape is asserted locally.
import * as nodeModule from 'node:module';
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(fileURLToPath(import.meta.url), '..', '..', 'src');
// Order matters, and the bare '' entry is last on purpose: a specifier like
// './cv-extraction' names both a directory and (via its index) a module, and
// handing Node the directory itself produces an EISDIR read error.
const CANDIDATES = ['.ts', '.tsx', '.mts', '/index.ts', '/index.tsx', ''];

const isFile = (candidate: string) => {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
};

type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown,
) => unknown;

const registerHooks = (nodeModule as unknown as {
  registerHooks: (hooks: { resolve: ResolveHook }) => void;
}).registerHooks;

/** Try each extension in turn; return the first that exists on disk. */
function firstExisting(base: string): string | undefined {
  for (const suffix of CANDIDATES) {
    const candidate = `${base}${suffix}`;
    if (isFile(candidate)) return candidate;
  }
  return undefined;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // `@/…` — the tsconfig path alias.
    if (specifier.startsWith('@/')) {
      const resolved = firstExisting(path.join(SRC, specifier.slice(2)));
      if (resolved) return { shortCircuit: true, url: pathToFileURL(resolved).href };
      return nextResolve(specifier, context);
    }

    // Extensionless RELATIVE imports between application modules. TypeScript
    // resolves `./cache-store` by trying extensions; Node's ESM resolver does
    // not, so a script that reaches any module using that style fails on a
    // transitive import rather than on anything it wrote itself.
    const parent = (context as { parentURL?: string }).parentURL;
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && parent?.startsWith('file:') && !path.extname(specifier)) {
      const resolved = firstExisting(path.resolve(path.dirname(fileURLToPath(parent)), specifier));
      if (resolved) return { shortCircuit: true, url: pathToFileURL(resolved).href };
    }

    return nextResolve(specifier, context);
  },
});
