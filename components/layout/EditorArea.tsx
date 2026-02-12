"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Save, Check, Globe, Square } from "lucide-react";
import { useIdeState } from "@/hooks/useIdeState";
import { useTheme } from "@/hooks/useTheme";
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
    previewUrl,
    startLivePreview,
    stopLivePreview,
  } = useIdeState();

  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const { theme } = useTheme();
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [previewStarting, setPreviewStarting] = useState(false);

  const handleSave = useCallback(async () => {
    await saveCurrentFile();
    setSavedFeedback(true);
  }, [saveCurrentFile]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  useEffect(() => {
    if (!savedFeedback) return;
    const t = setTimeout(() => setSavedFeedback(false), 1500);
    return () => clearTimeout(t);
  }, [savedFeedback]);

  const handleContentChange = useCallback(
    (path: string, value: string) => {
      setOpenFiles((prev) =>
        prev.map((f) => (f.path === path ? { ...f, content: value, isDirty: true } : f))
      );
    },
    [setOpenFiles]
  );

  const handleLivePreview = useCallback(async () => {
    if (previewUrl) {
      window.open(previewUrl, "_blank");
      return;
    }
    setPreviewStarting(true);
    try {
      await startLivePreview();
    } finally {
      setPreviewStarting(false);
    }
  }, [previewUrl, startLivePreview]);

  if (openFiles.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center bg-ds-bg-primary-light dark:bg-ds-bg-primary text-ds-text-muted-light dark:text-ds-text-muted"
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
      className="flex-1 flex flex-col min-w-0 bg-ds-bg-primary-light dark:bg-ds-bg-primary"
      role="region"
      aria-label="Editor de código"
    >
      {/* Abas + Salvar */}
      <div className="flex items-end shrink-0 border-b border-ds-border-light dark:border-ds-border bg-ds-surface-light/50 dark:bg-ds-surface/50 overflow-x-auto">
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
              className={`flex items-center gap-2 px-3 py-2 border-r border-ds-border-light dark:border-ds-border cursor-pointer min-w-0 max-w-[180px] group ${
                isActive
                  ? "bg-ds-bg-primary-light dark:bg-ds-bg-primary text-ds-text-primary-light dark:text-ds-text-primary border-b-2 border-b-ds-bg-primary-light dark:border-b-ds-bg-primary -mb-px"
                  : "bg-ds-surface-light/80 dark:bg-ds-surface/80 text-ds-text-secondary-light dark:text-ds-text-secondary hover:text-ds-text-primary-light dark:hover:text-ds-text-primary hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover"
              }`}
              onClick={() => setActiveFilePath(file.path)}
            >
              <span className="truncate text-sm">{file.name}</span>
              <span className="shrink-0 flex items-center w-4 h-4 justify-center">
                {file.isDirty && (
                  <span
                    className="w-2 h-2 rounded-full bg-white group-hover:hidden"
                    aria-hidden
                    title="Alterações não salvas"
                  />
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(file.path);
                  }}
                  className={`p-0.5 rounded hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon ${
                    file.isDirty ? "opacity-0 group-hover:opacity-100" : "opacity-70 group-hover:opacity-100"
                  } transition-opacity`}
                  aria-label={`Fechar ${file.name}`}
                >
                  <X className="w-3.5 h-3.5" aria-hidden />
                </button>
              </span>
            </div>
          );
        })}
        </div>
        <button
          type="button"
          onClick={() => handleLivePreview()}
          disabled={previewStarting}
          className={`flex items-center gap-2 px-3 py-2 shrink-0 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon ${
            previewUrl
              ? "text-ds-accent-light dark:text-ds-accent-neon bg-ds-accent-light/20 dark:bg-ds-accent-neon/20"
              : "text-ds-text-secondary-light dark:text-ds-text-secondary hover:text-ds-accent-light dark:hover:text-ds-accent-neon hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover disabled:opacity-50"
          }`}
          aria-label={previewUrl ? "Abrir Live Preview em nova aba" : "Abrir Live Preview"}
          title={previewUrl ? "Abrir Live Preview em nova aba" : "Live Preview"}
        >
          <Globe className="w-4 h-4" aria-hidden />
          {previewStarting ? "Iniciando…" : previewUrl ? "Abrir Preview" : "Live Preview"}
        </button>
        {previewUrl && (
          <button
            type="button"
            onClick={() => stopLivePreview()}
            className="flex items-center gap-2 px-3 py-2 shrink-0 text-sm text-ds-text-secondary-light dark:text-ds-text-secondary hover:text-ds-text-error hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon"
            aria-label="Interromper Live Preview"
            title="Interromper Live Preview"
          >
            <Square className="w-4 h-4" aria-hidden />
            Interromper
          </button>
        )}
        <button
          type="button"
          onClick={() => handleSave()}
          className={`flex items-center gap-2 px-3 py-2 shrink-0 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon ${
            savedFeedback
              ? "text-ds-accent-light dark:text-ds-accent-neon bg-ds-accent-light/20 dark:bg-ds-accent-neon/20"
              : "text-ds-text-secondary-light dark:text-ds-text-secondary hover:text-ds-accent-light dark:hover:text-ds-accent-neon hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover"
          }`}
          aria-label="Salvar arquivo (Ctrl+S)"
          title={savedFeedback ? "Salvo" : "Salvar (Ctrl+S)"}
        >
          {savedFeedback ? <Check className="w-4 h-4" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
          {savedFeedback ? "Salvo" : "Salvar"}
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
            theme={theme}
          />
        )}
      </div>
    </div>
  );
}
