"use client";

import { useEffect } from "react";
import { setupConnect } from "@webcontainer/api/connect";

/**
 * Rota exigida pela @webcontainer/api para conectar o preview (aba nova) ao WebContainer.
 * Sem esta rota, o preview redireciona para origin + /webcontainer/connect/:id e resulta em 404.
 * @see https://www.npmjs.com/package/@webcontainer/api (exports "./connect")
 */
export default function WebContainerConnectPage() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    setupConnect({ editorOrigin: window.location.origin });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-900 text-zinc-300 text-sm">
      Conectando ao Live Preview…
    </div>
  );
}
