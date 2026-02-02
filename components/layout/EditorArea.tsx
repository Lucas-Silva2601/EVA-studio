"use client";

import { useCallback, useEffect } from "react";
import { X, Save } from "lucide-react";
import { useIdeState } from "@/hooks/useIdeState";
import { MonacoWrapper } from "@/components/editor/MonacoWrapper";

/**
 * Área central com abas de arquivos e Monaco Editor.
 */
export function EditorArea() {
  const {
    openFiles,
    activeFilePath,
    setActiveFilePath,
    setOpenFiles,
    closeFile,
    saveCurrentFile,
  } = useIdeState();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveCurrentFile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveCurrentFile]);

  const activeFile = openFiles.find((f) => f.path === activeFilePath);

  const handleContentChange = useCallback(
    (path: string, value: string) => {
      setOpenFiles((prev) =>
        prev.map((f) => (f.path === path ? { ...f, content: value } : f))
      );
    },
    [setOpenFiles]
  );

  if (openFiles.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center bg-vscode-editor text-gray-500"
        role="region"
        aria-label="Área do editor"
      >
        <p className="text-sm">Nenhum arquivo aberto.</p>
        <p className="text-xs mt-1">Abra uma pasta e clique em um arquivo no explorador.</p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col min-w-0 bg-vscode-editor"
      role="region"
      aria-label="Editor de código"
    >
      {/* Abas + Salvar */}
      <div className="flex items-end shrink-0 border-b border-vscode-border bg-vscode-sidebar/50 overflow-x-auto">
        <div className="flex flex-1 min-w-0">
        {openFiles.map((file) => {
          const isActive = file.path === activeFilePath;
          return (
            <div
              key={file.path}
              role="tab"
              aria-selected={isActive}
              aria-controls="editor-panel"
              id={`tab-${file.path}`}
              className={`flex items-center gap-2 px-3 py-2 border-r border-vscode-border cursor-pointer min-w-0 max-w-[180px] group ${
                isActive
                  ? "bg-vscode-editor text-white border-b-2 border-b-vscode-editor -mb-px"
                  : "bg-vscode-sidebar/80 text-gray-400 hover:text-gray-200 hover:bg-vscode-sidebar-hover"
              }`}
              onClick={() => setActiveFilePath(file.path)}
            >
              <span className="truncate text-sm">{file.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(file.path);
                }}
                className="p-0.5 rounded hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-vscode-accent opacity-70 group-hover:opacity-100"
                aria-label={`Fechar ${file.name}`}
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
        </div>
        <button
          type="button"
          onClick={() => saveCurrentFile()}
          className="flex items-center gap-2 px-3 py-2 shrink-0 text-sm text-gray-400 hover:text-white hover:bg-vscode-sidebar-hover focus:outline-none focus:ring-1 focus:ring-vscode-accent"
          aria-label="Salvar arquivo (Ctrl+S)"
          title="Salvar (Ctrl+S)"
        >
          <Save className="w-4 h-4" aria-hidden />
          Salvar
        </button>
      </div>
      {/* Editor */}
      <div
        id="editor-panel"
        role="tabpanel"
        aria-labelledby={activeFile ? `tab-${activeFile.path}` : undefined}
        className="flex-1 min-h-0 overflow-hidden"
      >
        {activeFile && (
          <MonacoWrapper
            path={activeFile.path}
            content={activeFile.content}
            language={activeFile.language ?? "plaintext"}
            onChange={(value) => handleContentChange(activeFile.path, value)}
          />
        )}
      </div>
    </div>
  );
}
