"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { FileNode } from "@/types";
import { treeToIndentedText } from "@/lib/contextPacker";
import { getProjectMermaid } from "@/lib/groq";

export interface ArchitectureMapViewProps {
  fileTree: FileNode[];
  onClose: () => void;
}

/** Remove cercas de código markdown (```mermaid ... ```) se presentes. */
function stripMermaidFence(text: string): string {
  let t = text.trim();
  const match = t.match(/^```(?:mermaid)?\s*\n?([\s\S]*?)\n?```$/);
  if (match) t = match[1].trim();
  return t;
}

/**
 * Fase 13: Visualizador de diagrama Mermaid (mapa de arquitetura do projeto).
 * Gera o gráfico via Groq a partir da árvore de arquivos e renderiza com Mermaid.js.
 */
export function ArchitectureMapView({ fileTree, onClose }: ArchitectureMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mermaidCode, setMermaidCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (fileTree.length === 0) {
      setMermaidCode("graph TD\n  A[Projeto vazio]\n  Abra uma pasta para ver o mapa.");
      setLoading(false);
      return;
    }
    const treeText = treeToIndentedText(fileTree, 0);
    getProjectMermaid(treeText)
      .then((code) => {
        setMermaidCode(stripMermaidFence(code) || "graph TD\n  A[Erro ao gerar diagrama]");
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Erro ao gerar mapa.");
        setMermaidCode(null);
      })
      .finally(() => setLoading(false));
  }, [fileTree]);

  useEffect(() => {
    if (!mermaidCode || !containerRef.current || error) return;
    const el = containerRef.current;
    el.innerHTML = "";
    const id = "mermaid-diagram-" + Date.now();
    const pre = document.createElement("pre");
    pre.className = "mermaid";
    pre.id = id;
    pre.textContent = mermaidCode;
    el.appendChild(pre);
    import("mermaid")
      .then((mermaidModule) => {
        const mermaid = mermaidModule.default;
        mermaid.initialize({ startOnLoad: false, theme: "dark" });
        return mermaid.run({ nodes: [pre] });
      })
      .catch(() => {
        el.innerHTML = `<pre class="text-gray-400 p-4 text-sm">${mermaidCode}</pre>`;
      });
  }, [mermaidCode, error]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="architecture-map-title"
    >
      <div
        className="flex flex-col w-full max-w-4xl max-h-[85vh] rounded-lg bg-vscode-sidebar border border-vscode-border shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-vscode-border bg-vscode-titlebar/80">
          <h2 id="architecture-map-title" className="text-sm font-semibold text-gray-200">
            Mapa do Projeto (Mermaid)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-vscode-sidebar-hover focus:outline-none focus:ring-1 focus:ring-vscode-accent text-gray-400 hover:text-gray-200"
            aria-label="Fechar mapa"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto min-h-0 p-4 bg-vscode-bg/80">
          {loading && (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
              Gerando diagrama...
            </div>
          )}
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          <div ref={containerRef} className="min-h-[200px] mermaid-container" />
        </div>
      </div>
    </div>
  );
}
