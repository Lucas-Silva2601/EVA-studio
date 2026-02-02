"use client";

import { useState } from "react";
import { FolderOpen, FolderX, Terminal } from "lucide-react";
import { useIdeState } from "@/hooks/useIdeState";

/**
 * Barra de título da IDE com nome do projeto e ações principais.
 */
export function TitleBar() {
  const { folderName, openDirectory, forgetStoredDirectory, runCurrentFile, runStatus } = useIdeState();
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
      className="h-10 flex items-center justify-between px-3 bg-vscode-titlebar border-b border-vscode-border shrink-0"
      role="banner"
      aria-label="Barra de título"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm text-gray-200">EVA Studio</span>
        {folderName && (
          <span className="text-xs text-gray-400 truncate max-w-[200px]" title={folderName}>
            {folderName}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleOpenFolder}
          disabled={opening}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-sm hover:bg-vscode-sidebar-hover focus:outline-none focus:ring-2 focus:ring-vscode-accent disabled:opacity-50"
          aria-label="Abrir pasta local"
          title="Abrir pasta local"
        >
          <FolderOpen className="w-4 h-4" aria-hidden />
          {opening ? "Abrindo…" : "Abrir pasta"}
        </button>
        {folderName && (
          <button
            type="button"
            onClick={() => forgetStoredDirectory()}
            disabled={opening}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm hover:bg-vscode-sidebar-hover focus:outline-none focus:ring-2 focus:ring-vscode-accent disabled:opacity-50 text-gray-400 hover:text-gray-200"
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
          className="flex items-center gap-2 px-3 py-1.5 rounded text-sm hover:bg-vscode-sidebar-hover focus:outline-none focus:ring-2 focus:ring-vscode-accent disabled:opacity-50"
          aria-label="Executar arquivo ativo (Node ou Python)"
          title={!folderName ? "Abra uma pasta primeiro" : isRunFileRunning ? "Executando…" : "Executar arquivo ativo"}
        >
          <Terminal className="w-4 h-4" aria-hidden />
          {isRunFileRunning ? "Executando…" : "Executar"}
        </button>
      </div>
    </header>
  );
}
