"use client";

import { useCallback, useEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import { useIdeState } from "@/hooks/useIdeState";
import { MonacoDiffWrapper } from "@/components/editor/MonacoDiffWrapper";
import { getLanguageFromFilename } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";

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
  const { theme } = useTheme();

  const handleAccept = useCallback(() => {
    acceptDiffReview();
  }, [acceptDiffReview]);

  const handleReject = useCallback(() => {
    rejectDiffReview();
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
            const original: string = isNewFile ? "" : (file.beforeContent ?? "");
            const language = getLanguageFromFilename(file.filePath);

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
                <div className="h-[min(400px,50vh)] min-h-[200px] p-2">
                  <MonacoDiffWrapper
                    originalContent={original}
                    modifiedContent={file.afterContent}
                    language={language}
                    theme={theme}
                    onChange={(value) => updatePendingDiffContent(file.filePath, value)}
                  />
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
