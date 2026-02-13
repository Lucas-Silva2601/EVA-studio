# Segurança — Extensão EVA Studio Bridge e IDE

## Origens aceitas para postMessage

A IDE (Next.js) aceita mensagens `EVA_STUDIO_TO_PAGE` apenas de origens permitidas:

- `window.location.origin` (ex.: mesma origem da página)
- **Dev:** `http://localhost:3000`, `http://localhost:3001`, `http://127.0.0.1:3000`, `http://127.0.0.1:3001`

Isso está alinhado às `host_permissions` da extensão no `manifest.json`. Mensagens de outras origens são ignoradas.

A extensão envia `EVA_EXTENSION_CONNECTED` com `targetOrigin: '*'` no handshake inicial (origem da página é a mesma da IDE). Para `EVA_STUDIO_TO_PAGE` usa `window.location.origin`.

## Validação de payload

- **IDE (messaging.ts):** Exige `data.payload` objeto e com propriedade `type` antes de processar. Não processa mensagens malformadas.
- **Content-ide:** Só processa `EVA_STUDIO_FROM_PAGE` com `payload` objeto e `type` em `EVA_PING` ou `EVA_PROMPT_SEND`.
- **Content-gemini:** `handleSendPrompt` valida que `payload.prompt` é string.
- **Background:** Usa apenas `message.payload` quando é objeto; para `EVA_ERROR` extrai `message` como string.

## Tamanhos máximos

- **Prompt:** Não há limite imposto pela extensão; a UI do Gemini pode ter limite próprio.
- **Código/arquivos na IDE:** A aplicação Next.js aplica `lib/sanitize` (path até 512 chars, conteúdo até 1 MB). Ver abaixo.

## Onde a sanitização é aplicada

A **sanitização de conteúdo e caminhos** é feita na **IDE**, não na extensão:

- **Arquivo:** `lib/sanitize.ts` — `sanitizeFilePath` (path traversal, caracteres perigosos, tamanho) e `sanitizeCodeContent` (limite de 1 MB).
- **Uso:** `hooks/useIdeState.tsx` aplica `sanitizeFilePath` e `sanitizeCodeContent` ao gravar arquivos recebidos da extensão (código retornado do Gemini).

A extensão repassa os dados à IDE; a IDE é responsável por sanitizar antes de escrever em disco ou exibir de forma perigosa.

## Logs

- Não se loga o corpo do prompt nem o conteúdo de código capturado.
- Logs de erro incluem apenas metadados úteis: `tabId`, `type` da mensagem, `err?.message`.
