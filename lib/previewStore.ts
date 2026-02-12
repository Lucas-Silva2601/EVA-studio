/**
 * Store em memória para o Live Preview (alternativa ao WebContainer).
 * Persiste entre requests no mesmo processo (global para sobreviver a HMR no dev).
 */
const globalForPreview = globalThis as unknown as { __previewStore: Map<string, string> };

export function getPreviewStore(): Map<string, string> {
  if (!globalForPreview.__previewStore) {
    globalForPreview.__previewStore = new Map();
  }
  return globalForPreview.__previewStore;
}

export function setPreviewFiles(files: { path: string; contents: string }[]): void {
  const store = getPreviewStore();
  store.clear();
  for (const { path, contents } of files) {
    const normalized = path.replace(/^\.\//, "").replace(/^\/+/, "").trim() || "index.html";
    store.set(normalized, contents);
  }
  if (!store.has("index.html") && store.size > 0) {
    const first = store.keys().next().value;
    if (first) store.set("index.html", store.get(first)!);
  }
}

export function getPreviewFile(path: string): string | null {
  const store = getPreviewStore();
  const normalized = path.replace(/^\.\//, "").replace(/^\/+/, "").trim() || "index.html";
  return store.get(normalized) ?? null;
}
