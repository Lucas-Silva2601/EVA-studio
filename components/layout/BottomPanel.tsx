"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useResize } from "@/hooks/useResize";
import { useIdeState } from "@/hooks/useIdeState";

const PANEL_MIN = 120;
const PANEL_MAX = 400;
const PANEL_DEFAULT = 180;

/**
 * Painel inferior (Output) redimensionável, com mensagens do fluxo de automação.
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
  const { outputMessages, clearOutput, pendingTerminalCommands, clearPendingTerminalCommands } = useIdeState();
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
        aria-controls="panel-content"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-ds-text-primary-light dark:text-ds-text-primary">Output</span>
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

      {/* Conteúdo — Output */}
      {open && (
        <div id="panel-content" className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div
            ref={listRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 py-2 font-mono text-sm [scroll-behavior:smooth]"
            style={{ scrollbarWidth: "thin" }}
          >
            {pendingTerminalCommands.length > 0 && (
              <div className="mb-3 p-2 rounded bg-ds-surface-light dark:bg-ds-surface border border-ds-border-light dark:border-ds-border">
                <p className="text-sm font-medium text-ds-text-primary-light dark:text-ds-text-primary mb-1">
                  Comandos sugeridos pela IA (execute no terminal na pasta do projeto):
                </p>
                <ul className="list-disc list-inside text-sm text-ds-text-secondary-light dark:text-ds-text-secondary space-y-0.5 mb-2">
                  {pendingTerminalCommands.map((cmd, i) => (
                    <li key={i} className="font-mono">{cmd}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={clearPendingTerminalCommands}
                  className="text-xs px-2 py-1 rounded hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon"
                >
                  Limpar fila de comandos
                </button>
              </div>
            )}
            {outputMessages.length === 0 && pendingTerminalCommands.length === 0 ? (
              <p className="text-ds-text-muted-light dark:text-ds-text-muted text-sm">
                Mensagens do fluxo de automação aparecerão aqui (ex.: &quot;Analisando checklist...&quot;).
              </p>
            ) : outputMessages.length > 0 ? (
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
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
