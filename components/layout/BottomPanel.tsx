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
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [outputMessages]);

  const typeStyles = {
    info: "text-gray-300",
    success: "text-green-400",
    warning: "text-yellow-400",
    error: "text-red-400",
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
      className="flex flex-col shrink-0 bg-vscode-panel border-t border-vscode-border"
      style={{ height: open ? size : 40 }}
      role="region"
      aria-label="Painel de saída"
    >
      {/* Alça de redimensionamento no topo (borda entre editor e terminal) — arraste para mudar a altura */}
      {open && (
        <div
          className="h-3 shrink-0 bg-zinc-600 hover:bg-blue-500 transition-colors cursor-row-resize flex-shrink-0 flex items-center justify-center group"
          role="separator"
          aria-orientation="horizontal"
          aria-valuenow={size}
          aria-label="Arraste para redimensionar o painel Output"
          title="Arraste para redimensionar o painel Output"
          tabIndex={0}
          onMouseDown={onMouseDown}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") setSize((s) => Math.max(PANEL_MIN, s - 10));
            if (e.key === "ArrowDown") setSize((s) => Math.min(PANEL_MAX, s + 10));
          }}
        >
          <span className="h-0.5 w-12 bg-zinc-500 group-hover:bg-white/80 rounded-full opacity-70" aria-hidden />
        </div>
      )}
      {/* Cabeçalho do painel */}
      <div
        className="h-10 flex items-center justify-between px-3 border-b border-vscode-border bg-vscode-sidebar/80 shrink-0"
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
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Output
          </span>
          <span className="text-xs text-gray-500" aria-live="polite" title={`Estado: ${statusLabel}`}>
            • {statusLabel}
          </span>
          {open ? (
            <ChevronDown className="w-4 h-4 text-gray-500" aria-hidden />
          ) : (
            <ChevronUp className="w-4 h-4 text-gray-500" aria-hidden />
          )}
        </div>
        {open && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearOutput();
            }}
            className="p-1.5 rounded hover:bg-vscode-sidebar-hover focus:outline-none focus:ring-1 focus:ring-vscode-accent"
            aria-label="Limpar saída"
          >
            <Trash2 className="w-4 h-4 text-gray-500" aria-hidden />
          </button>
        )}
      </div>

      {/* Conteúdo — rola quando há muitas mensagens */}
      {open && (
        <div
          id="output-content"
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 py-2 font-mono text-sm"
          style={{ scrollbarWidth: "thin" }}
        >
          {outputMessages.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Mensagens do fluxo de automação aparecerão aqui (ex.: &quot;Analisando checklist...&quot;, &quot;Aguardando resposta do Gemini...&quot;).
            </p>
          ) : (
            outputMessages.map((msg) => (
              <div
                key={msg.id}
                className={`py-0.5 ${typeStyles[msg.type]}`}
                role="log"
              >
                <span className="text-gray-500 select-none">
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
