"use client";

import { useEffect } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { ensureMonacoWorkerFromCDN } from "@/lib/monacoWorkers";

interface MonacoDiffWrapperProps {
  /** Estado atual no disco (snapshot). Painel esquerdo; remoções em vermelho. */
  originalContent: string;
  /** Estado desejado da IA. Painel direito; adições em verde. Editável antes de aceitar. */
  modifiedContent: string;
  language: string;
  theme: "dark" | "light";
  /** Chamado quando o usuário edita o painel direito (modified). */
  onChange?: (value: string) => void;
}

export function MonacoDiffWrapper({
  originalContent,
  modifiedContent,
  language,
  theme,
  onChange,
}: MonacoDiffWrapperProps) {
  useEffect(() => {
    ensureMonacoWorkerFromCDN();
  }, []);

  return (
    <div className="w-full h-full border border-ds-border rounded-md overflow-hidden">
      <DiffEditor
        height="100%"
        language={language}
        original={originalContent}
        modified={modifiedContent}
        theme={theme === "dark" ? "vs-dark" : "light"}
        onMount={(diffEditor) => {
          if (!onChange) return;
          const modifiedEditor = diffEditor.getModifiedEditor();
          const model = modifiedEditor.getModel();
          if (model) {
            const d = model.onDidChangeContent(() => {
              onChange(modifiedEditor.getValue());
            });
            return () => d.dispose();
          }
        }}
        options={{
          renderSideBySide: true,
          readOnly: false,
          domReadOnly: false,
          originalEditable: false,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          ignoreTrimWhitespace: false,
        }}
      />
    </div>
  );
}