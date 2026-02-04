"use client";

import { useState } from "react";
import { X, Play, FileCode } from "lucide-react";
import { useIdeState } from "@/hooks/useIdeState";

/**
 * Fase 14 (Modo Gênesis): UI da Fila de Implementação.
 * Lista os arquivos que a IA planeja criar/alterar e botão "Executar Gênesis" para processar em lote.
 */
export function GenesisQueuePanel() {
  const { genesisQueue, setGenesisQueue, executeGenesisQueue } = useIdeState();
  const [executing, setExecuting] = useState(false);

  if (!genesisQueue || genesisQueue.length === 0) return null;

  const handleExecute = async () => {
    setExecuting(true);
    try {
      await executeGenesisQueue();
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg rounded-lg border border-vscode-border bg-vscode-sidebar shadow-xl overflow-hidden"
      role="region"
      aria-label="Fila de implementação Gênesis"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-vscode-border bg-vscode-titlebar/80">
        <h3 className="text-xs font-semibold text-gray-200 flex items-center gap-2">
          <FileCode className="w-4 h-4" aria-hidden />
          Arquivos Pendentes de Criação ({genesisQueue.length})
        </h3>
        <button
          type="button"
          onClick={() => setGenesisQueue(null)}
          className="p-1.5 rounded hover:bg-vscode-sidebar-hover text-gray-400 hover:text-gray-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-accent"
          aria-label="Fechar fila"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto scrollbar-thin p-2 space-y-1">
        {genesisQueue.map((file, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2 py-1.5 rounded bg-vscode-bg/60 text-xs font-mono text-gray-300 truncate"
            title={file.path}
          >
            <span className="truncate flex-1 min-w-0">{file.path}</span>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-vscode-border flex justify-end">
        <button
          type="button"
          onClick={handleExecute}
          disabled={executing}
          className="flex items-center gap-2 rounded bg-green-700 hover:bg-green-800 text-white px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-1 focus-visible:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Executar Gênesis (criar/alterar todos os arquivos)"
        >
          {executing ? (
            <>
              <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" aria-hidden />
              Executando...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" aria-hidden />
              Executar Gênesis
            </>
          )}
        </button>
      </div>
    </div>
  );
}
