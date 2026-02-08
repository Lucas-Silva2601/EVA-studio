"use client";

import { IdeStateProvider } from "@/hooks/useIdeState";
import { ThemeProvider } from "@/hooks/useTheme";
import { TitleBar } from "@/components/layout/TitleBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { EditorArea } from "@/components/layout/EditorArea";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { ChatPanel } from "@/components/layout/ChatPanel";
import { DiffReviewModal } from "@/components/layout/DiffReviewModal";
import { DeletionModal } from "@/components/layout/DeletionModal";
import { GenesisQueuePanel } from "@/components/layout/GenesisQueuePanel";

/**
 * MainLayout: Sidebar esquerda (Explorador) | Editor central + Output (embaixo) | Chat EVA (direita).
 * Chat na extremidade direita com altura total e largura redimensionável (ResizeHandle entre Editor e Chat).
 */
export default function HomePage() {
  return (
    <ThemeProvider>
      <IdeStateProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-12 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded focus:bg-ds-accent-light dark:focus:bg-ds-accent-neon focus:text-white dark:focus:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white dark:focus-visible:ring-gray-900"
      >
        Pular para conteúdo principal
      </a>
      <div className="h-screen flex flex-col overflow-hidden bg-ds-bg-primary-light dark:bg-ds-bg-primary theme-transition">
        <TitleBar />
        <main id="main-content" className="flex-1 flex min-h-0 overflow-hidden" role="main" tabIndex={-1}>
          <Sidebar />
          <div className="flex-1 flex flex-col min-h-0 min-w-[280px] overflow-hidden">
            <EditorArea />
            <BottomPanel />
          </div>
          <ChatPanel />
        </main>
        <DiffReviewModal />
        <DeletionModal />
        <GenesisQueuePanel />
      </div>
      </IdeStateProvider>
    </ThemeProvider>
  );
}
