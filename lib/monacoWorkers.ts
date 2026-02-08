/**
 * Configura o Monaco para usar workers via CDN.
 * Evita 404 quando workers locais não estão configurados (dev ou build estático).
 */

const CDN_BASE = "https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs";

export function ensureMonacoWorkerFromCDN(): void {
  if (typeof window === "undefined") return;
  const win = window as Window & {
    MonacoEnvironment?: { getWorkerUrl?: (module: string, label: string) => string };
  };
  if (win.MonacoEnvironment?.getWorkerUrl) return;
  win.MonacoEnvironment = {
    getWorkerUrl(_module: string, label: string) {
      if (label === "json") return `${CDN_BASE}/language/json/json.worker.js`;
      if (label === "css" || label === "scss" || label === "less")
        return `${CDN_BASE}/language/css/css.worker.js`;
      if (label === "html" || label === "handlebars" || label === "razor")
        return `${CDN_BASE}/language/html/html.worker.js`;
      if (label === "typescript" || label === "javascript")
        return `${CDN_BASE}/language/typescript/ts.worker.js`;
      return `${CDN_BASE}/editor/editor.worker.js`;
    },
  };
}
