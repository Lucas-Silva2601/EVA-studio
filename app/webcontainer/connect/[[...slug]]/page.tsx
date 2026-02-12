"use client";

import { useEffect, useState } from "react";
import { setupConnect } from "@webcontainer/api/connect";

/**
 * Rota exigida pela @webcontainer/api para conectar o preview (aba nova) ao WebContainer.
 * Deve ser aberta como popup pela aba do preview (window.opener); se acessada diretamente, não chama setupConnect.
 */
export default function WebContainerConnectPage() {
  const [status, setStatus] = useState<"connecting" | "no-opener" | "ok">("connecting");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.opener) {
      setStatus("no-opener");
      return;
    }
    try {
      setupConnect({ editorOrigin: window.location.origin });
      setStatus("ok");
    } catch {
      setStatus("no-opener");
    }
  }, []);

  if (status === "no-opener") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-900 text-zinc-300 text-sm px-4 text-center">
        Esta página é usada pelo Live Preview. Abra o preview pelo botão &quot;Live Preview&quot; no EVA Studio.
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-900 text-zinc-300 text-sm">
      {status === "connecting" ? "Conectando ao Live Preview…" : "Conectado."}
    </div>
  );
}
