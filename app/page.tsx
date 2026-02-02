"use client";

import { IdeStateProvider } from "@/hooks/useIdeState";
import { TitleBar } from "@/components/layout/TitleBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { EditorArea } from "@/components/layout/EditorArea";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { ChatPanel } from "@/components/layout/ChatPanel";
import { DiffReviewModal } from "@/components/layout/DiffReviewModal";

/**
 * MainLayout: Sidebar esquerda (Explorador) | Editor central + Output (embaixo) | Chat EVA (direita).
 * Chat na extremidade direita com altura total e largura redimensionável (ResizeHandle entre Editor e Chat).
 */
export default function HomePage() {
  return (
    <IdeStateProvider>
      <div className="h-screen flex flex-col overflow-hidden bg-vscode-bg">
        <TitleBar />
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
            <EditorArea />
            <BottomPanel />
          </div>
          <ChatPanel />
        </div>
        <DiffReviewModal />
      </div>
    </IdeStateProvider>
  );
}
