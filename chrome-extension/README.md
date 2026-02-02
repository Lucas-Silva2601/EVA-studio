# EVA Studio Bridge – Extensão Chrome

Ponte de comunicação entre a **IDE EVA Studio** (localhost:3000) e o **Google AI Studio** (aistudio.google.com). Manifest V3.

## Guia de instalação (Chrome)

1. Abra o Chrome e acesse **`chrome://extensions`**.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta **`chrome-extension`** deste repositório (a pasta que contém `manifest.json`).
5. A extensão **EVA Studio Bridge** aparecerá na lista. Mantenha-a habilitada.

Para testes: abra primeiro a **IDE** em `http://localhost:3000` e o **Google AI Studio** em `https://aistudio.google.com` (em outra aba). Use **Executar loop** na IDE.

## Permissões (mínimo necessário)

- **tabs**: rotear mensagens entre a aba da IDE e a aba do AI Studio
- **scripting**: injeção dos content scripts
- **storage**: guardar IDs das abas (IDE e AI Studio)
- **host_permissions**: `https://aistudio.google.com/*`, `http://localhost:3000/*`, `http://127.0.0.1:3000/*`

## Protocolo de mensagens (JSON)

| Tipo                | Direção        | Descrição |
|---------------------|----------------|-----------|
| **EVA_PROMPT_SEND** | IDE → Extensão | IDE envia prompt para injetar no AI Studio |
| **EVA_PROMPT_INJECT** | Extensão → AI Studio | Background envia ao content script do AI Studio (injetar + enviar) |
| **EVA_CODE_CAPTURED** | AI Studio → Extensão | Content script envia código extraído ao background |
| **EVA_CODE_RETURNED** | Extensão → IDE | Background envia código final (ou `payload.error`) à IDE |

### IDE → Extensão (enviar prompt)

```json
{
  "type": "EVA_STUDIO_FROM_PAGE",
  "payload": { "type": "EVA_PROMPT_SEND", "prompt": "texto do prompt" }
}
```

Via `window.postMessage(..., '*')`.

### Extensão → IDE (código ou fallback de conexão)

```json
{
  "type": "EVA_STUDIO_TO_PAGE",
  "payload": {
    "type": "EVA_CODE_RETURNED",
    "payload": {
      "code": "...",
      "filename": "App.js",
      "files": [{ "name": "...", "content": "..." }],
      "error": null
    }
  }
}
```

Se houver erro (aba fechada, extensão não instalada, etc.), o mesmo tipo vem com `payload.payload.error` preenchido. A IDE exibe o aviso no Output.

## Funcionamento técnico da ponte

- **Background (service worker)**: identifica a aba da IDE e a aba do AI Studio dinamicamente (registro via content scripts). Roteia `EVA_PROMPT_SEND` → `EVA_PROMPT_INJECT` e `EVA_CODE_CAPTURED` → `EVA_CODE_RETURNED`. Em falha (AI Studio não aberto, aba fechada), envia `EVA_CODE_RETURNED` com `payload.error`.
- **Content script (AI Studio)**: recebe `EVA_PROMPT_INJECT`, insere o texto no input (textarea/contenteditable), simula clique no botão de envio. Usa **MutationObserver** + **debounce** para detectar quando o streaming da IA termina; então extrai apenas blocos `<pre><code>` (higienização de Markdown) e envia **EVA_CODE_CAPTURED**.
- **Content script (IDE)**: escuta `window.postMessage` da página (EVA_PROMPT_SEND), repassa ao background; recebe do background EVA_CODE_RETURNED e repassa à página via `postMessage`. Fallback: se `chrome.runtime.lastError`, notifica a página com `payload.error`.

## Automação de interface (DOM Bot) e seletores

O content script do AI Studio usa listas de seletores CSS para:

- **Caixa de texto**: `textarea[placeholder*="Type"]`, `[contenteditable="true"][role="textbox"]`, `textarea`, etc.
- **Botão de enviar**: `button[type="submit"]`, `button[aria-label*="Send"]`, etc.

Se o Google AI Studio mudar o layout, inspecione a página (F12) e atualize os seletores em `content-ai-studio.js`.

## Sincronização de resposta e higienização

- **Debounce**: após a última mutação observada no DOM, aguarda 2,5 s antes de extrair os blocos (streaming encerrado).
- **Timeout global**: 2 min para não travar caso a IA não responda.
- **Higienização**: apenas nós `<pre><code>` (ou `code` isolado) são extraídos; texto em markdown fora de blocos de código é ignorado.
