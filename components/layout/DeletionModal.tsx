"use client";

import { useCallback, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { useIdeState } from "@/hooks/useIdeState";

/**
 * Modal de aprovação para deleções solicitadas pelo Analista (Groq).
 * Exibe "O Analista deseja apagar: [NOME]" e botão "Apagar"; a deleção física só ocorre após o clique.
 */
export function DeletionModal() {
  const { pendingDeletionQueue, approvePendingDeletion, rejectPendingDeletion } = useIdeState();
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleApprove = useCallback(() => {
    approvePendingDeletion();
  }, [approvePendingDeletion]);

  const handleReject = useCallback(() => {
    rejectPendingDeletion();
  }, [rejectPendingDeletion]);

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
    if (pendingDeletionQueue.length > 0) {
      dialogRef.current?.focus();
    }
  }, [pendingDeletionQueue.length]);

  const first = pendingDeletionQueue[0];
  if (!first) return null;

  const label = first.kind === "folder" ? "pasta" : "arquivo";
  const displayName = first.path.split("/").pop() || first.path;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deletion-modal-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex flex-col w-full max-w-md rounded-lg bg-ds-surface-light dark:bg-ds-surface border border-ds-border-light dark:border-ds-border shadow-xl overflow-hidden outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-neon focus-visible:ring-inset"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 py-3 border-b border-ds-border-light dark:border-ds-border bg-ds-surface-elevated-light/80 dark:bg-ds-surface-elevated/80">
          <h2
            id="deletion-modal-title"
            className="text-sm font-semibold text-ds-text-primary-light dark:text-ds-text-primary flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4 text-ds-text-warning" aria-hidden />
            Aprovar exclusão
          </h2>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-ds-text-primary-light dark:text-ds-text-primary">
            O Analista deseja apagar a {label}:{" "}
            <strong className="font-medium text-ds-text-primary-light dark:text-ds-text-primary break-all">
              {first.path}
            </strong>
          </p>
          {pendingDeletionQueue.length > 1 && (
            <p className="text-xs text-ds-text-secondary-light dark:text-ds-text-secondary">
              + {pendingDeletionQueue.length - 1} outra(s) exclusão(ões) na fila.
            </p>
          )}
        </div>
        <div className="shrink-0 px-4 py-3 border-t border-ds-border-light dark:border-ds-border flex justify-end gap-2 bg-ds-bg-secondary-light/50 dark:bg-ds-bg-secondary/50">
          <button
            type="button"
            onClick={handleReject}
            className="px-3 py-1.5 text-sm font-medium rounded border border-ds-border-light dark:border-ds-border bg-transparent text-ds-text-primary-light dark:text-ds-text-primary hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover focus-visible:ring-1 focus-visible:ring-ds-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApprove}
            className="px-3 py-1.5 text-sm font-medium rounded bg-ds-text-error dark:bg-ds-text-error text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ds-text-error focus-visible:ring-offset-1 dark:focus-visible:ring-offset-ds-surface"
            aria-label={`Apagar ${label} ${displayName}`}
          >
            Apagar
          </button>
        </div>
      </div>
    </div>
  );
}
