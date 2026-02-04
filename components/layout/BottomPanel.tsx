"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useResize } from "@/hooks/useResize";
import { useIdeState } from "@/hooks/useIdeState";

const PANEL_MIN = 120;
const PANEL_MAX = 400;
const PANEL_DEFAULT = 180;

/**
 * Painel inferior (Output/Terminal) redimensionável, com mensagens do fluxo de automação.
 */
export function BottomPanel() {
  const [open, setOpen] = useState(true);
  const { size, setSize, onMouseDown, onMouseMove, onMouseUp } = useResize(
    PANEL_DEFAULT,
    PANEL_MIN,
    PANEL_MAX,
    "vertical",
    "left",
    "eva-terminal-height"
  );
  const { outputMessages, clearOutput, loopStatus } = useIdeState();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [outputMessages]);

  const typeStyles = {
    info: "text-[var(--ds-text-info)]",
    success: "text-[var(--ds-text-success)]",
    warning: "text-[var(--ds-text-warning)]",
    error: "text-[var(--ds-text-error)]",
  };

  const LOOP_STATUS_LABELS: Record<string, string> = {
    idle: "Pronto",
    validating: "Validando",
    error: "Erro",
    awaiting_review: "Aguardando sua revisão",
  };
  const statusLabel = LOOP_STATUS_LABELS[loopStatus] ?? loopStatus;

  return (
    <div
      className="flex flex-col shrink-0 bg-ds-bg-secondary-light dark:bg-ds-bg-secondary border-t border-ds-border-light dark:border-ds-border transition-panel"
      style={{ height: open ? size : 40 }}
      role="region"
      aria-label="Painel de saída"
    >
      {/* Alça de redimensionamento no topo (borda entre editor e terminal) — arraste para mudar a altura */}
      {open && (
        <div
          className="resize-handle-vertical shrink-0 flex-shrink-0 flex items-center justify-center self-stretch min-h-[20px] relative z-10 select-none -mt-1 pt-1"
          role="separator"
          aria-orientation="horizontal"
          aria-valuenow={size}
          aria-label="Arraste para redimensionar o painel Output"
          title="Arraste para cima/baixo para redimensionar o painel Output"
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMouseDown(e);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSize((s) => Math.max(PANEL_MIN, s - 10));
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSize((s) => Math.min(PANEL_MAX, s + 10));
            }
          }}
        >
          <span className="resize-handle-inner h-0.5 w-12" aria-hidden />
        </div>
      )}
      {/* Cabeçalho do painel */}
      <div
        className="h-10 flex items-center justify-between px-3 border-b border-ds-border-light dark:border-ds-border bg-ds-surface-light/80 dark:bg-ds-surface/80 shrink-0"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        aria-expanded={open}
        aria-controls="output-content"
      >
        <div className="flex items-center gap-2">
          <span className="panel-title">
            Output
          </span>
          <span className="text-xs text-ds-text-muted-light dark:text-ds-text-muted" aria-live="polite" title={`Estado: ${statusLabel}`}>
            • {statusLabel}
          </span>
          {open ? (
            <ChevronDown className="w-4 h-4 text-ds-text-muted-light dark:text-ds-text-muted" aria-hidden />
          ) : (
            <ChevronUp className="w-4 h-4 text-ds-text-muted-light dark:text-ds-text-muted" aria-hidden />
          )}
        </div>
        {open && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearOutput();
            }}
            className="p-1.5 rounded hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon"
            aria-label="Limpar saída"
          >
            <Trash2 className="w-4 h-4 text-ds-text-muted-light dark:text-ds-text-muted" aria-hidden />
          </button>
        )}
      </div>

      {/* Conteúdo — rola quando há muitas mensagens */}
      {open && (
        <div
          id="output-content"
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 py-2 font-mono text-sm [scroll-behavior:smooth]"
          style={{ scrollbarWidth: "thin" }}
        >
          {outputMessages.length === 0 ? (
            <p className="text-ds-text-muted-light dark:text-ds-text-muted text-sm">
              Mensagens do fluxo de automação aparecerão aqui (ex.: &quot;Analisando checklist...&quot;, &quot;Aguardando resposta do Gemini...&quot;).
            </p>
          ) : (
            outputMessages.map((msg) => (
              <div
                key={msg.id}
                className={`py-0.5 ${typeStyles[msg.type]}`}
                role="log"
              >
                <span className="text-ds-text-muted-light dark:text-ds-text-muted select-none">
                  [{msg.timestamp.toLocaleTimeString("pt-BR")}]
                </span>{" "}
                {msg.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
