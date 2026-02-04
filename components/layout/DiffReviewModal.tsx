"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { Check, X, Edit3 } from "lucide-react";
import { useIdeState } from "@/hooks/useIdeState";

/**
 * Fase 9/10: Modal de Diff/Review (Human-in-the-loop).
 * Exibe comparação antes/depois por arquivo; suporta múltiplos arquivos (Fase 10).
 */
export function DiffReviewModal() {
  const {
    pendingDiffReview,
    acceptDiffReview,
    rejectDiffReview,
    updatePendingDiffContent,
  } = useIdeState();
  const [editingPath, setEditingPath] = useState<string | null>(null);

  const handleAccept = useCallback(() => {
    acceptDiffReview();
    setEditingPath(null);
  }, [acceptDiffReview]);

  const handleReject = useCallback(() => {
    rejectDiffReview();
    setEditingPath(null);
  }, [rejectDiffReview]);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleReject();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleReject]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [pendingDiffReview?.files.length]);

  if (!pendingDiffReview || pendingDiffReview.files.length === 0) return null;

  const { files } = pendingDiffReview;
  const singleFile = files.length === 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-review-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex flex-col w-full max-w-4xl max-h-[85vh] rounded-lg bg-ds-surface-light dark:bg-ds-surface border border-ds-border-light dark:border-ds-border shadow-xl overflow-hidden outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-neon focus-visible:ring-inset"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 py-3 border-b border-ds-border-light dark:border-ds-border bg-ds-surface-elevated-light/80 dark:bg-ds-surface-elevated/80">
          <h2 id="diff-review-title" className="text-sm font-semibold text-ds-text-primary-light dark:text-ds-text-primary">
            Revisar alterações ({files.length} arquivo{files.length !== 1 ? "s" : ""})
          </h2>
        </div>

        <div className="flex-1 overflow-auto min-h-0 p-3 space-y-3 scrollbar-thin">
          {files.map((file) => {
            const isNewFile = file.beforeContent === null;
            const isEditing = editingPath === file.filePath;

            return (
              <div
                key={file.filePath}
                className="rounded border border-ds-border-light dark:border-ds-border bg-ds-bg-primary-light/50 dark:bg-ds-bg-primary/50 overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-ds-text-primary-light dark:text-ds-text-primary bg-ds-surface-light/50 dark:bg-ds-surface/50">
                  <span className="truncate">{file.filePath}</span>
                  {isNewFile && (
                    <span className="text-xs text-green-400 shrink-0">(novo)</span>
                  )}
                </div>

                <div className="flex border-t border-ds-border-light dark:border-ds-border">
                    {isNewFile ? (
                      <div className="flex-1 flex flex-col p-2 min-w-0">
                        <label className="text-xs text-ds-text-secondary-light dark:text-ds-text-secondary mb-1">Conteúdo (editável)</label>
                        {isEditing ? (
                          <textarea
                            className="flex-1 min-h-[120px] px-2 py-1.5 font-mono text-sm bg-ds-bg-primary-light dark:bg-ds-bg-primary text-ds-text-primary-light dark:text-ds-text-primary border border-ds-border-light dark:border-ds-border rounded resize-y focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon disabled:opacity-50 disabled:cursor-not-allowed invalid:border-red-500"
                            value={file.afterContent}
                            onChange={(e) => updatePendingDiffContent(file.filePath, e.target.value)}
                            spellCheck={false}
                          />
                        ) : (
                          <pre className="min-h-[80px] max-h-[200px] overflow-auto px-2 py-1.5 font-mono text-sm text-gray-300 rounded whitespace-pre-wrap">
                            {file.afterContent}
                          </pre>
                        )}
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-xs text-ds-text-secondary-light dark:text-ds-text-secondary hover:text-ds-text-primary-light dark:hover:text-ds-text-primary"
                          onClick={() => setEditingPath(isEditing ? null : file.filePath)}
                          aria-label={isEditing ? "Sair da edição do conteúdo" : "Editar conteúdo do arquivo"}
                        >
                          <Edit3 className="w-3 h-3" aria-hidden /> {isEditing ? "Sair da edição" : "Editar"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0 p-2 border-r border-vscode-border">
                          <span className="text-xs text-gray-400">Antes</span>
                          <pre className="mt-1 min-h-[80px] max-h-[200px] overflow-auto px-2 py-1.5 font-mono text-xs text-gray-400 rounded whitespace-pre-wrap">
                            {file.beforeContent}
                          </pre>
                        </div>
                        <div className="flex-1 min-w-0 p-2">
                          <span className="text-xs text-ds-text-secondary-light dark:text-ds-text-secondary">Depois</span>
                          {isEditing ? (
                            <textarea
                              className="mt-1 w-full min-h-[120px] px-2 py-1.5 font-mono text-sm bg-ds-bg-primary-light dark:bg-ds-bg-primary text-ds-text-primary-light dark:text-ds-text-primary border border-ds-border-light dark:border-ds-border rounded resize-y focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon disabled:opacity-50 disabled:cursor-not-allowed invalid:border-red-500"
                              value={file.afterContent}
                              onChange={(e) => updatePendingDiffContent(file.filePath, e.target.value)}
                              spellCheck={false}
                            />
                          ) : (
                            <pre className="mt-1 min-h-[80px] max-h-[200px] overflow-auto px-2 py-1.5 font-mono text-xs text-green-300/90 rounded whitespace-pre-wrap">
                              {file.afterContent}
                            </pre>
                          )}
                          <button
                            type="button"
                            className="mt-1 flex items-center gap-1 text-xs text-ds-text-secondary-light dark:text-ds-text-secondary hover:text-ds-text-primary-light dark:hover:text-ds-text-primary"
                            onClick={() => setEditingPath(isEditing ? null : file.filePath)}
                            aria-label={isEditing ? "Sair da edição do conteúdo" : "Editar conteúdo do arquivo"}
                          >
                            <Edit3 className="w-3 h-3" aria-hidden /> {isEditing ? "Sair da edição" : "Editar"}
                          </button>
                        </div>
                      </>
                    )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-ds-border-light dark:border-ds-border bg-ds-surface-light/80 dark:bg-ds-surface/80">
          <button
            type="button"
            onClick={handleReject}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm bg-red-100 hover:bg-red-200 text-red-700 hover:text-red-800 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
            aria-label="Rejeitar todas as alterações"
          >
            <X className="w-4 h-4" aria-hidden />
            Rejeitar tudo
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm bg-green-100 hover:bg-green-200 text-green-700 hover:text-green-800 dark:bg-green-900/40 dark:hover:bg-green-900/60 dark:text-green-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-green-500"
            aria-label="Aceitar e gravar todos no disco"
          >
            <Check className="w-4 h-4" aria-hidden />
            Aceitar tudo
          </button>
        </div>
      </div>
    </div>
  );
}
