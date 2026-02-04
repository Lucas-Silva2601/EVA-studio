"use client";

import { useRef, useEffect, useState } from "react";
import { FileTree } from "@/components/file-explorer/FileTree";
import { useResize } from "@/hooks/useResize";
import { useIdeState } from "@/hooks/useIdeState";
import { ArchitectureMapView } from "@/components/layout/ArchitectureMapView";
import { GitBranch } from "lucide-react";

const SIDEBAR_MIN = 140;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 220;

/**
 * Barra lateral esquerda: apenas Explorador de Arquivos (altura total).
 */
export function Sidebar() {
  const [showMap, setShowMap] = useState(false);
  const { fileTree } = useIdeState();
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
      className="flex shrink-0 flex-col h-full max-h-[calc(100vh-2.5rem)] bg-vscode-sidebar border-r border-vscode-border"
      style={{ width: size }}
      role="complementary"
      aria-label="Explorador de arquivos"
    >
      <div className="px-2 py-2 border-b border-vscode-border shrink-0 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Explorador
        </h2>
        <button
          type="button"
          onClick={() => setShowMap(true)}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-gray-400 hover:text-gray-200 hover:bg-vscode-sidebar-hover focus:outline-none focus:ring-1 focus:ring-vscode-accent"
          aria-label="Ver mapa do projeto (Mermaid)"
          title="Ver mapa do projeto"
        >
          <GitBranch className="w-3.5 h-3.5" aria-hidden />
          Mapa
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin" style={{ scrollbarWidth: "thin" }}>
        <FileTree />
      </div>
      {showMap && (
        <ArchitectureMapView fileTree={fileTree} onClose={() => setShowMap(false)} />
      )}
      <div
        className="w-3 shrink-0 bg-zinc-600 hover:bg-blue-500 transition-colors cursor-col-resize flex-shrink-0 flex items-center justify-center group"
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
        <span className="w-0.5 h-8 bg-zinc-500 group-hover:bg-white/80 rounded-full opacity-70" aria-hidden />
      </div>
    </div>
  );
}
