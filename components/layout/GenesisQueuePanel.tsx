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
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg rounded-lg border border-ds-border-light dark:border-ds-border bg-ds-surface-light dark:bg-ds-surface shadow-xl overflow-hidden"
      role="region"
      aria-label="Fila de implementação Gênesis"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-ds-border-light dark:border-ds-border bg-ds-surface-elevated-light/80 dark:bg-ds-surface-elevated/80">
        <h3 className="text-xs font-semibold text-ds-text-primary-light dark:text-ds-text-primary flex items-center gap-2">
          <FileCode className="w-4 h-4" aria-hidden />
          Arquivos Pendentes de Criação ({genesisQueue.length})
        </h3>
        <button
          type="button"
          onClick={() => setGenesisQueue(null)}
          className="p-1.5 rounded hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover text-ds-text-secondary-light dark:text-ds-text-secondary hover:text-ds-text-primary-light dark:hover:text-ds-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon"
          aria-label="Fechar fila"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto scrollbar-thin p-2 space-y-1">
        {genesisQueue.map((file, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2 py-1.5 rounded bg-ds-bg-primary-light/60 dark:bg-ds-bg-primary/60 text-xs font-mono text-ds-text-primary-light dark:text-ds-text-primary truncate"
            title={file.path}
          >
            <span className="truncate flex-1 min-w-0">{file.path}</span>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-ds-border-light dark:border-ds-border flex justify-end">
        <button
          type="button"
          onClick={handleExecute}
          disabled={executing}
          className="flex items-center gap-2 rounded bg-ds-accent-light dark:bg-ds-accent-neon hover:bg-ds-accent-light-hover dark:hover:bg-ds-accent-neon-hover text-white dark:text-gray-900 px-3 py-1.5 text-xs font-medium shadow-[var(--ds-glow-neon)] focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-ds-surface-light dark:disabled:bg-ds-surface disabled:text-ds-text-muted-light dark:disabled:text-ds-text-muted disabled:shadow-none"
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
