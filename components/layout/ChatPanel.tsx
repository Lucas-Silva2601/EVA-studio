"use client";

import { useRef, useEffect } from "react";
import { useResize } from "@/hooks/useResize";
import { ChatSidebar } from "@/components/layout/ChatSidebar";

const CHAT_MIN = 250;
const CHAT_MAX = 600;
const CHAT_DEFAULT = 350;

/**
 * Painel direito dedicado ao Chat EVA (altura total).
 * Possui alça de redimensionamento à esquerda: arrastar para a esquerda aumenta a largura.
 */
export function ChatPanel() {
  const { size, setSize, onMouseDown, onMouseMove, onMouseUp } = useResize(
    CHAT_DEFAULT,
    CHAT_MIN,
    CHAT_MAX,
    "horizontal",
    "right",
    "eva-chat-width"
  );
  const panelRef = useRef<HTMLDivElement>(null);

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
      ref={panelRef}
      className="flex shrink-0 h-full bg-vscode-sidebar border-l border-vscode-border"
      style={{ width: size }}
      role="complementary"
      aria-label="Chat EVA"
    >
      <div
        className="resize-handle-horizontal shrink-0 flex-shrink-0 flex items-center justify-center"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={size}
        aria-label="Redimensionar chat"
        tabIndex={0}
        onMouseDown={onMouseDown}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setSize((s) => Math.min(CHAT_MAX, s + 10));
          if (e.key === "ArrowRight") setSize((s) => Math.max(CHAT_MIN, s - 10));
        }}
      >
        <span className="resize-handle-inner w-0.5 h-8" aria-hidden />
      </div>
      <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
        <ChatSidebar />
      </div>
    </div>
  );
}
