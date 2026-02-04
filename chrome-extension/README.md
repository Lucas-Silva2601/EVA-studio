# EVA Studio Bridge v3.0 – Extensão Chrome

Ponte de comunicação entre a **IDE EVA Studio** (localhost:3000) e o **Google Gemini** (gemini.google.com). O **Analista (Groq)** orquestra o envio de subtópicos do checklist para o **Gemini**, que atua como Programador. Manifest V3.

## Guia de instalação (Chrome)

1. Abra o Chrome e acesse **`chrome://extensions`**.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta **`chrome-extension`** deste repositório (a pasta que contém `manifest.json`).
5. A extensão **EVA Studio Bridge v3.0** aparecerá na lista. Mantenha-a habilitada.

Para usar: abra a **IDE** em `http://localhost:3000` e o **Gemini** em `https://gemini.google.com` (em outra aba). Na IDE, use **Executar Fase** (Groq) ou **+Gemini** (Executar Fase com Gemini) para enviar tópicos ao Gemini.

Se aparecer "Content script não disponível na aba do Gemini", **recarregue a aba do Gemini (F5)** — isso garante que o script seja injetado. Abas abertas antes da extensão ser instalada/recarregada podem não ter o script.

### Robustez (v3.0)
- **Re-registro periódico** no content-gemini.js (a cada 45s) e ao voltar à aba do Gemini — evita tab ID obsoleto.
- **Validação no background**: antes de usar o ID armazenado, verifica se a aba ainda existe e pertence ao Gemini; se não, busca via `chrome.tabs.query`.
- **Retry** quando o envio falha: tenta novamente após rediscovery da aba.
- **Suporte a www**: extensão também funciona em `https://www.gemini.google.com`.
- **Injeção programática**: se o content script não estiver carregado na aba (ex.: aba aberta antes da extensão), o background injeta o script automaticamente antes de enviar o prompt.

## Permissões

- **tabs**: rotear mensagens entre a aba da IDE e a aba do Gemini
- **scripting**: injeção dos content scripts
- **storage**: guardar IDs das abas (IDE e Gemini)
- **host_permissions**: `https://gemini.google.com/*`, `http://localhost:3000/*`, `http://127.0.0.1:3000/*`

## Protocolo de mensagens (JSON)

| Tipo                | Direção        | Descrição |
|---------------------|----------------|-----------|
| **EVA_PROMPT_SEND** | IDE → Extensão | IDE envia prompt para injetar no Gemini |
| **EVA_PROMPT_INJECT** | Extensão → Gemini | Background envia ao content script do Gemini (injetar + enviar) |
| **EVA_CODE_CAPTURED** | Gemini → Extensão | Content script envia código extraído ao background |
| **EVA_CODE_RETURNED** | Extensão → IDE | Background envia código final (ou `payload.error`) à IDE |

### IDE → Extensão (enviar prompt)

```json
{
  "type": "EVA_STUDIO_FROM_PAGE",
  "payload": { "type": "EVA_PROMPT_SEND", "prompt": "texto do prompt" }
}
```

Via `window.postMessage(..., '*')`.

### Extensão → IDE (código ou erro)

```json
{
  "type": "EVA_STUDIO_TO_PAGE",
  "payload": {
    "type": "EVA_CODE_RETURNED",
    "payload": {
      "code": "...",
      "filename": "path/to/file",
      "files": [{ "name": "path/to/file", "content": "..." }],
      "error": null
    }
  }
}
```

Se houver erro (aba fechada, extensão não instalada, etc.), o mesmo tipo vem com `payload.payload.error` preenchido.

## Arquitetura

- **Popup**: status de conexão em tempo real (IDE localhost e aba Gemini).
- **Background (service worker)**: identifica a aba da IDE e a aba do Gemini; roteia `EVA_PROMPT_SEND` → `EVA_PROMPT_INJECT` e `EVA_CODE_CAPTURED` → `EVA_CODE_RETURNED`.
- **Content script (Gemini)**: recebe `EVA_PROMPT_INJECT`, insere o texto no input (textarea ou role="combobox"), simula envio. Usa **MutationObserver** para capturar a resposta apenas quando o ícone "Stop" some ou o botão "Share" aparece (streaming encerrado). Extrai blocos de código e `FILE: path/filename`; envia **EVA_CODE_CAPTURED**.
- **Content script (IDE)**: escuta `window.postMessage` (EVA_PROMPT_SEND), repassa ao background; recebe EVA_CODE_RETURNED e repassa à página via `postMessage`.

## Automação no Gemini (content-gemini.js)

Seletores (podem mudar com atualizações do Gemini – inspecione a página):

- **Caixa de prompt**: `[role="combobox"]`, `textarea[placeholder*="Enter"]`, `[contenteditable="true"]`, etc.
- **Botão de envio**: `button[type="submit"]`, `button[aria-label*="Send"]`, etc.
- **Resposta completa**: ícone "Stop" some OU botão "Share" aparece → então extrair código.

A extensão usa debounce e timeout (2 min) para considerar o streaming encerrado antes de extrair os blocos `<pre><code>` e a convenção `FILE: path/filename`.
