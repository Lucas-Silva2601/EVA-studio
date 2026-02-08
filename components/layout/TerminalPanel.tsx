"use client";

import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { spawnWebContainerShell } from "@/lib/runtime";

const ERROR_PATTERNS = ["Error:", "Failed", "EEXIT"];
const PROMPT_PATTERN = /\s[>$]\s*$/;

export function TerminalPanel({
  isVisible,
  onErrorDetected,
  onCommandComplete,
}: {
  isVisible: boolean;
  onErrorDetected?: () => void;
  onCommandComplete?: () => void;
}) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const shellWriterRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
  const outputBufferRef = useRef("");
  const commandCompleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const injectCommand = useCallback((cmd: string) => {
    const writer = shellWriterRef.current;
    if (writer) {
      try {
        writer.write(cmd + "\n");
      } catch {
        /* shell não conectado */
      }
    }
  }, []);

  const clearTerminal = useCallback(() => {
    const term = xtermRef.current;
    if (term) term.clear();
  }, []);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current || !isVisible) return;

    const el = terminalRef.current;
    let disposed = false;
    let term: Terminal | null = null;
    let shellWriter: WritableStreamDefaultWriter<string> | null = null;

    const cleanup = () => {
      disposed = true;
      if (commandCompleteTimeoutRef.current) clearTimeout(commandCompleteTimeoutRef.current);
      shellWriter?.releaseLock?.();
      term?.dispose();
      xtermRef.current = null;
      shellWriterRef.current = null;
    };

    const scheduleCommandComplete = () => {
      if (commandCompleteTimeoutRef.current) clearTimeout(commandCompleteTimeoutRef.current);
      commandCompleteTimeoutRef.current = setTimeout(() => {
        commandCompleteTimeoutRef.current = null;
        onCommandComplete?.();
      }, 400);
    };

    const handleOutput = (data: string) => {
      term?.write(data);
      outputBufferRef.current += data;
      if (outputBufferRef.current.length > 8000) {
        outputBufferRef.current = outputBufferRef.current.slice(-4000);
      }
      const buf = outputBufferRef.current;
      if (ERROR_PATTERNS.some((p) => buf.includes(p))) {
        onErrorDetected?.();
      }
      if (PROMPT_PATTERN.test(buf) || buf.trimEnd().endsWith(">")) {
        scheduleCommandComplete();
      }
    };

    const checkAndInit = () => {
      if (disposed || !terminalRef.current) return;
      if (el.offsetParent === null || el.offsetWidth <= 0 || el.offsetHeight <= 0) {
        requestAnimationFrame(checkAndInit);
        return;
      }

      term = new Terminal({
        cols: 80,
        rows: 24,
        cursorBlink: true,
        theme: {
          background: "#0D0D0F",
          foreground: "#F1F3F5",
          cursor: "#FF4D4D",
          selectionBackground: "rgba(255, 77, 77, 0.3)",
        },
        fontSize: 13,
        fontFamily: "ui-monospace, monospace",
        allowProposedApi: true,
      });

      try {
        term.open(el);
      } catch {
        cleanup();
        return;
      }

      xtermRef.current = term;

      spawnWebContainerShell(handleOutput)
        .then((shell) => {
          if (disposed) return;
          shellWriter = shell.input.getWriter();
          shellWriterRef.current = shellWriter;
          term!.onData((data) => shellWriter?.write(data));
        })
        .catch(() => {
          term!.write("\r\n\x1b[31mErro ao conectar ao shell.\x1b[0m\r\n");
          onErrorDetected?.();
        });
    };

    requestAnimationFrame(() => requestAnimationFrame(checkAndInit));

    return cleanup;
  }, [isVisible, onErrorDetected, onCommandComplete]);

  const quickActions = [
    { label: "npm i", cmd: "npm i" },
    { label: "npm run dev", cmd: "npm run dev" },
    { label: "ls", cmd: "ls" },
  ];

  return (
    <div className="flex flex-col w-full h-full min-h-0 bg-[#0D0D0F] border-t border-ds-border">
      {/* Toolbar de ações rápidas */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 shrink-0 border-b border-ds-border/50">
        {quickActions.map(({ label, cmd }) => (
          <button
            key={label}
            type="button"
            onClick={() => injectCommand(cmd)}
            className="px-2 py-1 text-xs font-mono rounded border border-ds-border/70 bg-transparent text-ds-text-secondary hover:bg-ds-accent-neon/20 hover:border-ds-accent-neon/50 hover:text-ds-text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon"
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={clearTerminal}
          className="px-2 py-1 text-xs font-mono rounded border border-ds-border/70 bg-transparent text-ds-text-secondary hover:bg-ds-accent-neon/20 hover:border-ds-accent-neon/50 hover:text-ds-text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon ml-auto"
        >
          Clear
        </button>
      </div>
      {/* Área do terminal */}
      <div className="flex-1 min-h-0 p-2 overflow-hidden">
        <div ref={terminalRef} className="w-full h-full" />
      </div>
    </div>
  );
}
