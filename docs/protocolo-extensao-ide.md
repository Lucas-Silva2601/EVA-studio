# Protocolo IDE ↔ Extensão (EVA Studio Bridge)

Documentação centralizada do protocolo de mensagens entre a IDE (Next.js em localhost) e a extensão Chrome EVA Studio Bridge. Para tipos TypeScript do contrato, ver `lib/messaging.ts` e re-exports em `types/index.ts`.

---

## Visão geral

- **IDE** (página em localhost:3000/3001) comunica com o **content script da IDE** via `window.postMessage`.
- O **content script da IDE** fala com o **background** (service worker) via `chrome.runtime.sendMessage`.
- O **background** roteia para o **content script do Gemini** (aba gemini.google.com) via `chrome.tabs.sendMessage`.
- Respostas voltam: Gemini → background → content IDE → `postMessage` → página IDE.

---

## Mensagens da IDE → Extensão (postMessage)

A página envia mensagens com `type: "EVA_STUDIO_FROM_PAGE"` e `payload` com um subtipo:

| payload.type    | payload       | Quem recebe   | Descrição |
|-----------------|---------------|---------------|-----------|
| `EVA_PING`      | (vazio)       | content-ide   | Verifica se a extensão está ativa; content-ide responde com EVA_PONG. |
| `EVA_PROMPT_SEND` | `{ prompt: string }` | content-ide → background | Envia o prompt para ser injetado no Gemini. |

**Formato:**

```ts
window.postMessage(
  { type: "EVA_STUDIO_FROM_PAGE", payload: { type: "EVA_PING" } },
  "*"
);
window.postMessage(
  { type: "EVA_STUDIO_FROM_PAGE", payload: { type: "EVA_PROMPT_SEND", prompt: "..." } },
  "*"
);
```

---

## Mensagens da Extensão → IDE (postMessage)

O content script da IDE envia para a página com `type: "EVA_STUDIO_TO_PAGE"` e `payload: { type, payload }`:

| type                | payload       | Descrição |
|---------------------|---------------|-----------|
| `EVA_EXTENSION_CONNECTED` | (nenhum; mensagem direta `data.type`, sem payload aninhado) | Handshake: extensão anunciando que está na página. |
| `EVA_PONG`          | `{}`          | Resposta ao EVA_PING. |
| `EVA_CODE_RETURNED`  | ver abaixo    | Código/arquivos capturados do Gemini ou erro. |

**EVA_CODE_RETURNED — estrutura do payload:**

- `error?: string` — presente quando há erro (extensão não disponível, Gemini não aberto, etc.).
- Sem `error`: `code?`, `filename?`, `language?`, `files?` (array de `{ name, content }`), `blocks?` (blocos brutos).

Tipos em código: `CodeResponsePayload` e `ErrorPayload` em `lib/messaging.ts`; re-exportados em `types/index.ts`.

---

## Background ↔ Content IDE (chrome.runtime)

| Direção   | type                | payload      | Descrição |
|-----------|---------------------|-------------|-----------|
| IDE → BG  | `REGISTER_IDE_TAB`  | `{}`        | Regista a aba da IDE; background guarda tabId. |
| IDE → BG  | `EVA_PROMPT_SEND`   | `{ prompt }`| Repassa ao Gemini (EVA_PROMPT_INJECT). |
| BG → IDE  | `EVA_CODE_RETURNED` | `{ code?, filename?, files?, error? }` | Resposta ou erro para a IDE. |

Todas as mensagens da IDE têm `source: "eva-content-ide"`.

---

## Background ↔ Content Gemini (chrome.runtime)

| Direção    | type                  | payload      | Descrição |
|------------|-----------------------|-------------|-----------|
| Gemini → BG| `REGISTER_GEMINI_TAB` | `{}`        | Regista a aba do Gemini. |
| BG → Gemini| `EVA_PROMPT_INJECT`   | `{ prompt }`| Injetar prompt no input e enviar; depois capturar resposta. |
| Gemini → BG| `EVA_CODE_CAPTURED`   | `{ code?, filename?, files? }` | Código/arquivos extraídos da página. |
| Gemini → BG| `EVA_ERROR`           | `{ message }` | Erro (prompt vazio, input não encontrado, etc.). |

Todas as mensagens do Gemini têm `source: "eva-content-gemini"`.

---

## Referência de tipos (IDE)

- **Contratos:** `lib/messaging.ts` — `CodeResponsePayload`, `ErrorPayload`, `ExtensionMessageType`, `WaitForCodeResult`, `WaitForCodeError`.
- **Re-exports:** `types/index.ts` (para documentação e uso em outros módulos).
- **Normalização de payload:** `lib/normalizeExtensionPayload.ts` — `normalizeToFiles()`, `FILENAME_ASK_GROQ`.

Atualize este documento quando alterar tipos ou mensagens para manter o contrato único.
