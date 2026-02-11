"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/** Erro conhecido do xterm ao ocultar/redimensionar: Viewport acessa dimensions após dispose. */
const XTERM_DIMENSIONS_ERROR = "reading 'dimensions'";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Error Boundary que captura o crash do xterm (dimensions undefined) ao trocar de aba
 * ou redimensionar, evitando que a IDE quebre. Exibe fallback e permite "Tentar de novo".
 */
export class TerminalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): Partial<State> | null {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes(XTERM_DIMENSIONS_ERROR)) {
      return { hasError: true, message: msg };
    }
    return null;
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    if (!error.message.includes(XTERM_DIMENSIONS_ERROR)) return;
    this.setState({ hasError: true, message: error.message });
  }

  reset = () => {
    this.setState({ hasError: false, message: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center gap-3 w-full h-full min-h-[120px] bg-[#0D0D0F] border-t border-ds-border px-4 py-4 text-center">
            <p className="text-ds-text-secondary-light dark:text-ds-text-secondary text-sm">
              O terminal encontrou um erro ao atualizar a tela. Isso pode ocorrer ao trocar de aba ou usar o Live Preview.
            </p>
            <button
              type="button"
              onClick={this.reset}
              className="px-3 py-1.5 rounded border border-ds-border bg-ds-surface-light dark:bg-ds-surface text-ds-text-primary-light dark:text-ds-text-primary text-sm hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon"
            >
              Tentar de novo
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
