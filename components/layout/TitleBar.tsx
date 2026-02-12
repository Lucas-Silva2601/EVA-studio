"use client";

import { useState } from "react";
import { FolderOpen, FolderX, Loader2, Sun, Moon } from "lucide-react";
import { useIdeState } from "@/hooks/useIdeState";
import { useTheme } from "@/hooks/useTheme";

/**
 * Barra de título da IDE com nome do projeto e ações principais.
 */
export function TitleBar() {
  const { folderName, openDirectory, forgetStoredDirectory } = useIdeState();
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
      </div>
    </header>
  );
}
