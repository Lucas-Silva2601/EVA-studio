"use client";

import dynamic from "next/dynamic";
import { useRef, useEffect } from "react";
import type { editor } from "monaco-editor";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface MonacoWrapperProps {
  path: string;
  content: string;
  language: string;
  onChange: (value: string) => void;
  /** Tema do editor: "vs-dark" quando dark, "vs" quando light (Fase 6). */
  theme?: "dark" | "light";
}

/**
 * Configura o Monaco para usar workers via CDN, evitando 404 quando workers
 * locais não estão configurados (ex.: em dev ou build estático).
 */
function ensureMonacoWorkerFromCDN() {
  if (typeof window === "undefined") return;
  const win = window as Window & { MonacoEnvironment?: { getWorkerUrl?: (module: string, label: string) => string } };
  if (win.MonacoEnvironment?.getWorkerUrl) return;
  const cdnBase = "https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs";
  win.MonacoEnvironment = {
    getWorkerUrl(_module: string, label: string) {
      if (label === "json") return `${cdnBase}/language/json/json.worker.js`;
      if (label === "css" || label === "scss" || label === "less") return `${cdnBase}/language/css/css.worker.js`;
      if (label === "html" || label === "handlebars" || label === "razor") return `${cdnBase}/language/html/html.worker.js`;
      if (label === "typescript" || label === "javascript") return `${cdnBase}/language/typescript/ts.worker.js`;
      return `${cdnBase}/editor/editor.worker.js`;
    },
  };
}

/**
 * Wrapper do Monaco Editor com tema escuro e suporte a múltiplas linguagens.
 * Usa CDN para workers quando não configurados localmente (evita 404).
 * Chama editor.layout() quando o container redimensiona (ex.: painel do chat).
 */
export function MonacoWrapper({ path, content, language, onChange, theme = "dark" }: MonacoWrapperProps) {
  const monacoTheme = theme === "dark" ? "vs-dark" : "vs";
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    ensureMonacoWorkerFromCDN();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      editorRef.current?.layout();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full" role="application" aria-label={`Editor: ${path}`}>
      <MonacoEditor
        height="100%"
        language={language}
        value={content}
        onChange={(value) => onChange(value ?? "")}
        onMount={(editor) => {
          editorRef.current = editor;
        }}
        theme={monacoTheme}
        options={{
          minimap: { enabled: true },
          lineNumbers: "on",
          wordWrap: "on",
          fontSize: 14,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          padding: { top: 16 },
        }}
        loading={
          <div className="flex items-center justify-center h-full text-ds-text-muted-light dark:text-ds-text-muted">
            Carregando editor...
          </div>
        }
      />
    </div>
  );
}
