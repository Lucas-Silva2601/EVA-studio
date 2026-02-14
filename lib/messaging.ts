import { normalizeToFiles } from "@/lib/normalizeExtensionPayload";

/**
 * Protocolo de comunicação IDE ↔ Extensão Chrome (EVA Studio Bridge).
 *
 * CONTRATO – Mensagem da IDE para a extensão:
 *   { type: 'EVA_STUDIO_FROM_PAGE', payload: { type: 'EVA_PROMPT_SEND', prompt: string } }
 *
 * CONTRATO – Mensagem da extensão para a IDE (código ou fallback de conexão):
 *   { type: 'EVA_STUDIO_TO_PAGE', payload: { type: 'EVA_CODE_RETURNED', payload: { files?, code?, filename?, language?, error? } } }
 * - error presente: aba do AI Studio fechada, extensão não instalada ou outro erro.
 * - Sem error: code/filename ou files (múltiplos arquivos); blocks opcional.
 *
 * Origens aceitas para postMessage (EVA_STUDIO_TO_PAGE): window.location.origin ou whitelist de dev
 * (localhost:3000, localhost:3001, 127.0.0.1:3000, 127.0.0.1:3001). Ver docs/seguranca-extensao.md.
 * Sanitização (path + conteúdo) é aplicada na IDE em lib/sanitize e hooks ao gravar arquivos.
 */

export type ExtensionMessageType = "CODE_RESPONSE" | "ERROR";

export interface CodeResponsePayload {
  code?: string;
  language?: string;
  filename?: string;
  /** Fase 10: múltiplos arquivos prontos (name = path relativo). */
  files?: Array<{ name: string; content: string }>;
  /** Blocos brutos; IDE aplica parser para extrair filename por comentário. */
  blocks?: Array<{ code: string; language?: string }>;
}

export interface ErrorPayload {
  message?: string;
}

export type ExtensionMessagePayload = CodeResponsePayload | ErrorPayload;

export type ExtensionMessageHandler = (
  type: ExtensionMessageType,
  payload: ExtensionMessagePayload
) => void;

/**
 * Envia o prompt à extensão Chrome (content script na página da IDE repassa ao background).
 * Tipo de mensagem exato: EVA_STUDIO_FROM_PAGE + payload.type === EVA_PROMPT_SEND.
 * Só tem efeito se a extensão EVA Studio Bridge estiver instalada e a página for localhost:3000 ou 127.0.0.1:3000.
 *
 * O chamador deve garantir que a tarefa é a próxima na sequência do checklist (getFirstPendingTaskLine)
 * e que não está reenviando a mesma tarefa (trava canSendTask/recordLastSentTask) antes de chamar esta função.
 */
/** Origens permitidas para postMessage da extensão (dev: localhost/127.0.0.1 portas 3000 e 3001). */
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];

function isAllowedOrigin(origin: string): boolean {
  return origin === (typeof window !== "undefined" ? window.location.origin : "") || ALLOWED_ORIGINS.includes(origin);
}

export type ChatInputImage = {
  base64: string;
  mimeType: string;
};

export function sendPromptToExtension(prompt: string, images?: ChatInputImage[]): void {
  if (typeof window === "undefined") return;
  // Não logar o conteúdo do prompt; apenas metadados (segurança).
  console.log("[IDE -> EXT] Enviando prompt...", { promptLength: prompt?.length ?? 0, imagesCount: images?.length ?? 0 });
  window.postMessage(
    {
      type: "EVA_STUDIO_FROM_PAGE",
      payload: { type: "EVA_PROMPT_SEND", prompt, images },
    },
    "*"
  );
}

/**
 * Listener genérico para mensagens da extensão (EVA_PONG, CODE_RESPONSE, ERROR).
 * Retorna função para cancelar o listener.
 */
export function onExtensionMessage(
  handler: ExtensionMessageHandler,
  options?: { acceptEvaPong?: boolean }
): () => void {
  if (typeof window === "undefined") return () => { };

  const listener = (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data;
    // Handshake: extensão anuncia que está conectada (postMessage com type direto)
    if (data?.type === "EVA_EXTENSION_CONNECTED") {
      console.log("[IDE -> EXT] Recebi EVA_EXTENSION_CONNECTED; extensão online.");
      handler("CODE_RESPONSE", { _connected: true } as ExtensionMessagePayload);
      return;
    }
    // Validação de origem: apenas origens permitidas (dev: localhost/127.0.0.1:3000|3001).
    if (typeof window !== "undefined" && !isAllowedOrigin(event.origin)) return;
    if (data?.type !== "EVA_STUDIO_TO_PAGE") return;
    const rawPayload = data.payload;
    if (rawPayload == null || typeof rawPayload !== "object") return;
    if (!("type" in rawPayload)) return;
    const { type, payload } = rawPayload as {
      type: string;
      payload: ExtensionMessagePayload & Record<string, unknown>;
    };
    if (type === "EVA_PONG" && options?.acceptEvaPong) {
      (handler as (type: "CODE_RESPONSE", payload: Record<string, unknown>) => void)("CODE_RESPONSE", { _pong: true });
      return;
    }
    if (type === "EVA_CODE_RETURNED") {
      const p = payload as CodeResponsePayload & { error?: string };
      if (p?.error) handler("ERROR", { message: normalizeExtensionErrorMessage(p.error) });
      else handler("CODE_RESPONSE", p ?? {});
    } else if (type === "CODE_RESPONSE" || type === "ERROR") {
      handler(type as ExtensionMessageType, payload as ExtensionMessagePayload);
    }
  };

  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

/** Timeouts e handshake (docs: ver docs/performance-ux-extensao.md). */
const PING_TIMEOUT_MS = 10000;
const EXTENSION_HANDSHAKE_MS = 10000;
const DEFAULT_WAIT_FOR_CODE_TIMEOUT_MS = 600000; // 10 minutos
const RECONNECT_PING_ATTEMPTS = 2;

/**
 * Converte mensagens de erro técnicas da extensão/Chrome para texto em português com ação sugerida.
 */
function normalizeExtensionErrorMessage(raw: string): string {
  if (!raw || typeof raw !== "string") return "Erro desconhecido da extensão.";
  const lower = raw.toLowerCase();
  if (lower.includes("receiving end") || lower.includes("could not establish connection") || lower.includes("não foi possível estabelecer")) {
    return "Conexão com a extensão falhou. Recarregue a aba do AI Studio (F5) e verifique se a EVA Studio Bridge está instalada.";
  }
  if (lower.includes("timeout")) {
    return "Tempo esgotado. Verifique se a extensão está instalada, abra aistudio.google.com em uma aba e tente novamente.";
  }
  return raw;
}

/**
 * Envia EVA_PING para a extensão. Se o content script estiver na página, responde EVA_PONG.
 * Timeout de 10s para evitar "Extensão não detectada" enquanto a extensão está processando.
 */
export function pingExtension(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      unsubscribe();
      console.warn("[IDE -> EXT] EVA_PING sem EVA_PONG em 10s — extensão não está ativa nesta página.");
      resolve(false);
    }, PING_TIMEOUT_MS);

    const unsubscribe = onExtensionMessage(
      (type, payload) => {
        if (type === "CODE_RESPONSE" && payload && typeof payload === "object" && "_pong" in payload) {
          clearTimeout(timer);
          unsubscribe();
          resolve(true);
        }
      },
      { acceptEvaPong: true }
    );

    console.log("[IDE -> EXT] Enviando EVA_PING para detectar extensão.");
    window.postMessage(
      { type: "EVA_STUDIO_FROM_PAGE", payload: { type: "EVA_PING" } },
      "*"
    );
  });
}

/**
 * Verifica se a extensão está conectada; se não, tenta reconexão automática (até RECONNECT_PING_ATTEMPTS Pings).
 * Só chama onExtensionNotDetected após esgotar as tentativas.
 */
export async function pingExtensionWithReconnect(onExtensionNotDetected?: () => void): Promise<boolean> {
  for (let attempt = 1; attempt <= RECONNECT_PING_ATTEMPTS; attempt++) {
    const ok = await pingExtension();
    if (ok) return true;
    if (attempt < RECONNECT_PING_ATTEMPTS) {
      console.log("[IDE -> EXT] Reconexão automática: disparando novo Ping...");
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  onExtensionNotDetected?.();
  return false;
}

export interface WaitForCodeResult {
  ok: true;
  code: string;
  language?: string;
  filename?: string;
  /** Fase 10: quando a extensão envia múltiplos arquivos (ou parser produz vários). */
  files?: Array<{ name: string; content: string }>;
}

export interface WaitForCodeError {
  ok: false;
  error: string;
}

export { FILENAME_ASK_GROQ } from "@/lib/normalizeExtensionPayload";

/**
 * Envia o prompt à extensão e aguarda CODE_RESPONSE ou ERROR até o timeout.
 * Timeout padrão: DEFAULT_WAIT_FOR_CODE_TIMEOUT_MS (2 min). Handshake: EXTENSION_HANDSHAKE_MS (10s) sem resposta dispara Ping; onExtensionNotDetected só após RECONNECT_PING_ATTEMPTS falhas.
 */
export function waitForCodeFromExtension(
  prompt: string,
  timeoutMs = DEFAULT_WAIT_FOR_CODE_TIMEOUT_MS,
  onExtensionNotDetected?: () => void,
  images?: ChatInputImage[]
): Promise<WaitForCodeResult | WaitForCodeError> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve({ ok: false, error: "Ambiente não disponível." });
      return;
    }

    let resolved = false;
    const handshakeTimer = setTimeout(async () => {
      if (resolved) return;
      console.warn("[IDE -> EXT] 10s sem resposta — tentando reconexão automática (Ping)...");
      const reconnected = await pingExtensionWithReconnect(onExtensionNotDetected);
      if (!reconnected && !resolved) {
        console.warn("[IDE -> EXT] Reconexão falhou; extensão não detectada.");
      }
    }, EXTENSION_HANDSHAKE_MS);

    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      clearTimeout(handshakeTimer);
      unsubscribe();
      console.warn("[messaging] waitForCodeFromExtension timeout", { timeoutMs });
      resolve({
        ok: false,
        error: `Tempo esgotado (${timeoutMs / 1000}s). Instale a EVA Studio Bridge, abra aistudio.google.com em uma aba e recarregue (F5) se necessário.`,
      });
    }, timeoutMs);

    const unsubscribe = onExtensionMessage((type, payload) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(handshakeTimer);
      clearTimeout(timer);
      unsubscribe();
      if (type === "CODE_RESPONSE") {
        const p = payload as CodeResponsePayload;
        const files = normalizeToFiles(p);
        const first = files[0];
        resolve({
          ok: true,
          code: first?.content ?? "",
          language: p.language,
          filename: first?.name,
          files: files.length > 0 ? files : undefined,
        });
      } else {
        const p = payload as ErrorPayload;
        const rawError = p.message ?? "Erro desconhecido da extensão.";
        resolve({ ok: false, error: normalizeExtensionErrorMessage(rawError) });
      }
    });

    sendPromptToExtension(prompt, images);
  });
}
