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
}

/**
 * Wrapper do Monaco Editor com tema escuro e suporte a múltiplas linguagens.
 * Chama editor.layout() quando o container redimensiona (ex.: painel do chat).
 */
export function MonacoWrapper({ path, content, language, onChange }: MonacoWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

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
        theme="vs-dark"
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
          <div className="flex items-center justify-center h-full text-gray-500">
            Carregando editor...
          </div>
        }
      />
    </div>
  );
}
