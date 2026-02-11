"use client";

import { useRef, useEffect } from "react";
import { FileTree, type FileTreeHandle } from "@/components/file-explorer/FileTree";
import { useResize } from "@/hooks/useResize";
import { FilePlus, FolderPlus } from "lucide-react";

const SIDEBAR_MIN = 140;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 220;

/**
 * Barra lateral esquerda: apenas Explorador de Arquivos (altura total).
 */
export function Sidebar() {
  const fileTreeRef = useRef<FileTreeHandle>(null);
  const { size, setSize, onMouseDown, onMouseMove, onMouseUp } = useResize(
    SIDEBAR_DEFAULT,
    SIDEBAR_MIN,
    SIDEBAR_MAX,
    "horizontal",
    "left",
    "eva-sidebar-width"
  );
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => onMouseMove(e);
    const handleUp = () => onMouseUp();
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div
      ref={sidebarRef}
      className="flex shrink-0 flex-row h-full max-h-[calc(100vh-2.5rem)] bg-ds-surface-light dark:bg-ds-surface border-r border-ds-border-light dark:border-ds-border"
      style={{ width: size }}
      role="complementary"
      aria-label="Explorador de arquivos"
    >
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <div className="px-2 py-2 border-b border-ds-border-light dark:border-ds-border shrink-0 flex items-center justify-between gap-2">
          <h2 className="panel-title">
            Explorador
          </h2>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => fileTreeRef.current?.startCreateFile()}
              className="p-1.5 rounded text-ds-text-secondary-light dark:text-ds-text-secondary hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover hover:text-ds-accent-neon focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon disabled:opacity-50 disabled:cursor-not-allowed"
              title="Novo arquivo"
              aria-label="Novo arquivo"
            >
              <FilePlus className="w-4 h-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => fileTreeRef.current?.startCreateDirectory()}
              className="p-1.5 rounded text-ds-text-secondary-light dark:text-ds-text-secondary hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover hover:text-ds-accent-neon focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon disabled:opacity-50 disabled:cursor-not-allowed"
              title="Nova pasta"
              aria-label="Nova pasta"
            >
              <FolderPlus className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin" style={{ scrollbarWidth: "thin" }}>
          <FileTree ref={fileTreeRef} />
        </div>
      </div>
      <div
        className="resize-handle-horizontal shrink-0 flex-shrink-0 flex items-center justify-center self-stretch min-w-[8px] relative z-10"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={size}
        aria-label="Arraste para redimensionar o explorador"
        title="Arraste para redimensionar o explorador"
        tabIndex={0}
        onMouseDown={onMouseDown}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setSize((s) => Math.max(SIDEBAR_MIN, s - 10));
          if (e.key === "ArrowRight") setSize((s) => Math.min(SIDEBAR_MAX, s + 10));
        }}
      >
        <span className="resize-handle-inner w-0.5 h-8" aria-hidden />
      </div>
    </div>
  );
}
