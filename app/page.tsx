"use client";

import dynamic from "next/dynamic";
import { IdeStateProvider, useIdeState } from "@/hooks/useIdeState";
import { ThemeProvider } from "@/hooks/useTheme";
import { TitleBar } from "@/components/layout/TitleBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";

const EditorArea = dynamic(
  () => import("@/components/layout/EditorArea").then((m) => ({ default: m.EditorArea })),
  { ssr: false, loading: () => <EditorAreaSkeleton /> }
);

const ChatPanel = dynamic(
  () => import("@/components/layout/ChatPanel").then((m) => ({ default: m.ChatPanel })),
  { ssr: false, loading: () => <ChatPanelSkeleton /> }
);

const DiffReviewModal = dynamic(
  () => import("@/components/layout/DiffReviewModal").then((m) => ({ default: m.DiffReviewModal })),
  { ssr: false }
);

const DeletionModal = dynamic(
  () => import("@/components/layout/DeletionModal").then((m) => ({ default: m.DeletionModal })),
  { ssr: false }
);

const GenesisQueuePanel = dynamic(
  () => import("@/components/layout/GenesisQueuePanel").then((m) => ({ default: m.GenesisQueuePanel })),
  { ssr: false }
);

function EditorAreaSkeleton() {
  return (
    <div
      className="flex-1 flex flex-col min-w-0 bg-ds-bg-primary-light dark:bg-ds-bg-primary items-center justify-center text-ds-text-muted-light dark:text-ds-text-muted text-sm"
      role="region"
      aria-label="Carregando editor"
    >
      <span aria-hidden>Carregando editor...</span>
    </div>
  );
}

function ChatPanelSkeleton() {
  return (
    <div
      className="flex-1 min-w-[250px] flex flex-col items-center justify-center bg-ds-surface-light dark:bg-ds-surface text-ds-text-muted-light dark:text-ds-text-muted text-sm border-l border-ds-border-light dark:border-ds-border"
      role="region"
      aria-label="Carregando chat"
    >
      <span aria-hidden>Carregando chat...</span>
    </div>
  );
}

function LazyModals() {
  const { pendingDiffReview, pendingDeletionQueue, genesisQueue } = useIdeState();
  return (
    <>
      {pendingDiffReview != null && <DiffReviewModal />}
      {pendingDeletionQueue.length > 0 && <DeletionModal />}
      {genesisQueue != null && genesisQueue.length > 0 && <GenesisQueuePanel />}
    </>
  );
}

/**
 * MainLayout: Sidebar esquerda (Explorador) | Editor central + Output (embaixo) | Chat EVA (direita).
 * Editor e Chat carregam de forma lazy para otimizar a inicialização.
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
          <LazyModals />
        </div>
      </IdeStateProvider>
    </ThemeProvider>
  );
}
