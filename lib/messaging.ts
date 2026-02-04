import { blocksToFiles, parseCodeBlocksFromMarkdown, parseSingleFileWithFilePrefix, extractFilePathStrict, extractFilePathFromFullText, stripFilenameComment, inferFilenameFromContent } from "@/lib/markdownCodeParser";

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
 */
export function sendPromptToExtension(prompt: string): void {
  if (typeof window === "undefined") return;
  console.log("[IDE -> EXT] Enviando prompt...", { promptLength: prompt?.length ?? 0 });
  window.postMessage(
    {
      type: "EVA_STUDIO_FROM_PAGE",
      payload: { type: "EVA_PROMPT_SEND", prompt },
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
  if (typeof window === "undefined") return () => {};

  const listener = (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data;
    // Handshake: extensão anuncia que está conectada (postMessage com type direto)
    if (data?.type === "EVA_EXTENSION_CONNECTED") {
      console.log("[IDE -> EXT] Recebi EVA_EXTENSION_CONNECTED; extensão online.");
      handler("CODE_RESPONSE", { _connected: true } as ExtensionMessagePayload);
      return;
    }
    if (typeof window !== "undefined" && event.origin !== window.location.origin) return;
    if (data?.type !== "EVA_STUDIO_TO_PAGE" || !data.payload) return;

    const { type, payload } = data.payload as {
      type: string;
      payload: ExtensionMessagePayload & Record<string, unknown>;
    };
    if (type === "EVA_PONG" && options?.acceptEvaPong) {
      (handler as (type: "CODE_RESPONSE", payload: Record<string, unknown>) => void)("CODE_RESPONSE", { _pong: true });
      return;
    }
    if (type === "EVA_CODE_RETURNED") {
      const p = payload as CodeResponsePayload & { error?: string };
      if (p?.error) handler("ERROR", { message: p.error });
      else handler("CODE_RESPONSE", p ?? {});
    } else if (type === "CODE_RESPONSE" || type === "ERROR") {
      handler(type as ExtensionMessageType, payload as ExtensionMessagePayload);
    }
  };

  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

const PING_TIMEOUT_MS = 10000;

/**
 * Envia EVA_PING para a extensão. Se o content script estiver na página, responde EVA_PONG.
 * Timeout de 10s para evitar "Extensão não detectada" enquanto o Gemini está gerando.
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

/** Número de tentativas de reconexão (Ping) antes de dar erro no Output. */
const RECONNECT_PING_ATTEMPTS = 2;

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

/** Nome sentinela quando FILE: não foi encontrado na 1ª/2ª linha; a IDE deve perguntar ao Groq antes de salvar. */
export const FILENAME_ASK_GROQ = "__ASK_GROQ__";

/**
 * Extrai nome de arquivo da resposta do Gemini: regex /FILE:\s*([a-zA-Z0-9._\-\/]+)/i em TODO o texto.
 * Se encontrar FILE: index.html (ou qualquer extensão), a IDE DEVE usar esse nome.
 * Se não encontrar, retorna null → IDE usa FILENAME_ASK_GROQ e pausa para pedir nome (Groq ou usuário) antes de salvar.
 */
function extractFileNameFromGeminiResponse(rawCode: string): string | null {
  const path = extractFilePathFromFullText(rawCode) ?? extractFilePathStrict(rawCode);
  return path ?? null;
}

/**
 * Normaliza o payload da extensão para lista de arquivos.
 * Regra: FILE: em todo o texto ou em blocos markdown → usa esse nome. Se não encontrar, pausa com FILENAME_ASK_GROQ (pedir nome antes de salvar).
 */
function normalizeToFiles(p: CodeResponsePayload): Array<{ name: string; content: string }> {
  if (p.files && p.files.length > 0) return p.files;
  if (p.blocks && p.blocks.length > 0) return blocksToFiles(p.blocks);
  const rawCode = (p.code ?? "").trim();
  if (!rawCode) return [];
  const singleWithPrefix = parseSingleFileWithFilePrefix(rawCode);
  if (singleWithPrefix) return [singleWithPrefix];
  const fromMarkdown = parseCodeBlocksFromMarkdown(rawCode);
  const fileFromText = extractFileNameFromGeminiResponse(rawCode);
  if (fromMarkdown.length > 0) {
    if (fileFromText && fromMarkdown.length === 1) {
      const content = stripFilenameComment(fromMarkdown[0].content);
      return [{ name: fileFromText, content }];
    }
    const hasFilePrefix = /FILE\s*:/i.test(rawCode);
    if (hasFilePrefix && fromMarkdown.length === 1) {
      const strictPath = extractFilePathStrict(rawCode);
      if (strictPath) {
        const content = stripFilenameComment(fromMarkdown[0].content);
        return [{ name: strictPath, content }];
      }
    }
    return fromMarkdown;
  }
  const strictPath = fileFromText ?? extractFilePathStrict(rawCode);
  const inferred = inferFilenameFromContent(rawCode);
  const name = strictPath ?? p.filename?.trim() ?? inferred ?? FILENAME_ASK_GROQ;
  const content = strictPath || inferred ? stripFilenameComment(rawCode) : rawCode;
  return [{ name, content }];
}

const EXTENSION_HANDSHAKE_MS = 10000;

/**
 * Envia o prompt à extensão e aguarda CODE_RESPONSE ou ERROR até o timeout.
 * Timeout em ms (padrão 120000 = 2 min).
 * Handshake: 10s sem resposta dispara tentativa de reconexão (Ping); só chama onExtensionNotDetected após falha.
 * Fase 10: retorna files[] quando há múltiplos arquivos; senão code/filename (retrocompat).
 */
export function waitForCodeFromExtension(
  prompt: string,
  timeoutMs = 120000,
  onExtensionNotDetected?: () => void
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
      resolve({ ok: false, error: `Timeout: extensão não respondeu em ${timeoutMs / 1000}s. Verifique se o Gemini (gemini.google.com) está aberto e a extensão instalada.` });
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
        resolve({ ok: false, error: p.message ?? "Erro desconhecido da extensão." });
      }
    });

    sendPromptToExtension(prompt);
  });
}
