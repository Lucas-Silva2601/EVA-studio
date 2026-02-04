"use client";

import { useState } from "react";
import { FolderOpen, FolderX, Terminal, Loader2, Sun, Moon } from "lucide-react";
import { useIdeState } from "@/hooks/useIdeState";
import { useTheme } from "@/hooks/useTheme";

/**
 * Barra de título da IDE com nome do projeto e ações principais.
 */
export function TitleBar() {
  const { folderName, openDirectory, forgetStoredDirectory, runCurrentFile, runStatus } = useIdeState();
  const { theme, toggleTheme } = useTheme();
  const [opening, setOpening] = useState(false);

  const handleOpenFolder = async () => {
    setOpening(true);
    try {
      await openDirectory();
    } finally {
      setOpening(false);
    }
  };

  const isRunFileRunning = runStatus === "running";
  const canRunFile = !!folderName && !isRunFileRunning && !opening;

  return (
    <header
      className="h-10 flex items-center justify-between px-3 bg-ds-surface-elevated-light dark:bg-ds-surface-elevated border-b border-ds-border-light dark:border-ds-border shrink-0"
      role="banner"
      aria-label="Barra de título"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm text-ds-text-primary-light dark:text-ds-text-primary">EVA Studio</span>
        {folderName && (
          <span className="text-xs text-ds-text-secondary-light dark:text-ds-text-secondary truncate max-w-[200px]" title={folderName}>
            {folderName}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-ds-text-primary-light dark:text-ds-text-primary hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-neon"
          aria-label={theme === "dark" ? "Alternar para tema claro" : "Alternar para tema escuro"}
          title={theme === "dark" ? "Tema claro" : "Tema escuro"}
        >
          {theme === "dark" ? <Sun className="w-4 h-4 shrink-0" aria-hidden /> : <Moon className="w-4 h-4 shrink-0" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={handleOpenFolder}
          disabled={opening}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-ds-text-primary-light dark:text-ds-text-primary hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-neon disabled:opacity-50"
          aria-label="Abrir pasta local"
          title="Abrir pasta local"
        >
          {opening ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden /> : <FolderOpen className="w-4 h-4 shrink-0" aria-hidden />}
          {opening ? "Abrindo…" : "Abrir pasta"}
        </button>
        {folderName && (
          <button
            type="button"
            onClick={() => forgetStoredDirectory()}
            disabled={opening}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-neon disabled:opacity-50 text-ds-text-secondary-light dark:text-ds-text-secondary hover:text-ds-text-primary-light dark:hover:text-ds-text-primary"
            aria-label="Esquecer pasta (remove persistência)"
            title="Esquecer pasta salva e fechar projeto"
          >
            <FolderX className="w-4 h-4" aria-hidden />
            Esquecer pasta
          </button>
        )}
        <button
          type="button"
          onClick={() => runCurrentFile()}
          disabled={!canRunFile}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-sm bg-ds-accent-light dark:bg-ds-accent-neon hover:bg-ds-accent-light-hover dark:hover:bg-ds-accent-neon-hover text-white dark:text-gray-900 shadow-[var(--ds-glow-neon)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-neon disabled:opacity-50 disabled:bg-ds-surface-hover-light dark:disabled:bg-ds-surface-hover disabled:text-ds-text-secondary-light dark:disabled:text-ds-text-secondary disabled:shadow-none"
          aria-label="Executar arquivo ativo (Node ou Python)"
          title={!folderName ? "Abra uma pasta primeiro" : isRunFileRunning ? "Executando…" : "Executar arquivo ativo"}
        >
          {isRunFileRunning ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Terminal className="w-4 h-4" aria-hidden />}
          {isRunFileRunning ? "Executando…" : "Executar"}
        </button>
      </div>
    </header>
  );
}
