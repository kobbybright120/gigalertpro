// Node ESM custom loader — resolves extensionless .js imports (Vite-style)
// and injects import.meta.env polyfill for Vite modules
import { resolve as pathResolve, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  // Only handle relative imports without file extensions
  if (
    specifier.startsWith(".") &&
    !specifier.includes("?") &&
    !/\.\w+$/.test(specifier)
  ) {
    try {
      const parentPath = fileURLToPath(context.parentURL);
      const dir = dirname(parentPath);
      for (const ext of [".js", ".mjs", ".ts"]) {
        const full = pathResolve(dir, specifier + ext);
        if (existsSync(full)) {
          return { url: pathToFileURL(full).href, shortCircuit: true };
        }
      }
    } catch {
      /* fall through to default resolver */
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  // For .js files under src/, inject import.meta.env polyfill
  if (url.includes("/src/") && url.endsWith(".js")) {
    const filePath = fileURLToPath(url);
    let source = readFileSync(filePath, "utf-8");
    // Inject env polyfill at the top (after any imports)
    const envPolyfill = `
if (!import.meta.env) {
  Object.defineProperty(import.meta, "env", {
    value: { PROD: true, DEV: false, MODE: "production" },
    writable: true,
  });
}
`;
    // Find the last import statement and insert after it
    const importEnd = source.lastIndexOf("\nimport ");
    if (importEnd >= 0) {
      const lineEnd = source.indexOf("\n", importEnd + 1);
      source =
        source.slice(0, lineEnd + 1) + envPolyfill + source.slice(lineEnd + 1);
    } else {
      source = envPolyfill + source;
    }
    return { source, format: "module", shortCircuit: true };
  }
  return nextLoad(url, context);
}
