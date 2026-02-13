# Performance e UX — Extensão EVA Studio Bridge

Valores de timeouts, intervalos, estratégia de retry e mapeamento de erros técnicos para mensagens ao usuário. Referência para manutenção e ajustes futuros.

---

## Timeouts e handshake (IDE — lib/messaging.ts)

| Constante | Valor | Descrição |
|-----------|--------|-----------|
| `PING_TIMEOUT_MS` | 10 000 (10s) | Timeout do EVA_PING para considerar extensão ausente. |
| `EXTENSION_HANDSHAKE_MS` | 10 000 (10s) | Tempo sem resposta antes de tentar reconexão (Ping) em waitForCodeFromExtension. |
| `DEFAULT_WAIT_FOR_CODE_TIMEOUT_MS` | 120 000 (2 min) | Timeout padrão de waitForCodeFromExtension (espera por código do Gemini). |
| `RECONNECT_PING_ATTEMPTS` | 2 | Número de Pings antes de chamar onExtensionNotDetected. |

Se respostas longas do Gemini causarem timeout com frequência, considerar aumentar `DEFAULT_WAIT_FOR_CODE_TIMEOUT_MS` ou expor configuração em ciclo futuro.

---

## Polling e captura (content-gemini.js)

| Constante | Valor | Descrição |
|-----------|--------|-----------|
| `REGISTER_INTERVAL_MS` | 45 000 (45s) | Re-registro da aba no background; suficiente para manter tabId sem sobrecarga. |
| `POLL_INTERVAL_MS` | 200 | Intervalo de verificação (Stop/Share) durante captura da resposta. |
| `DEBOUNCE_AFTER_STOP_MS` | 350 | Atraso após o botão Stop sumir antes de capturar (evita captura prematura). |
| `DEBOUNCE_AFTER_SHARE_MS` | 250 | Atraso após o botão Share aparecer antes de capturar. |
| `CAPTURE_TIMEOUT_MS` | 90 000 (90s) | Timeout máximo da captura; ao fim, extrai o que houver. |

O MutationObserver e o interval em waitForResponseComplete são desconectados em captureAndResolve e no timeout (sem vazamento).

---

## Retry de injeção (background.js)

Quando o content script do Gemini não está carregado, o background injeta `content-gemini.js` e tenta reenviar a mensagem:

- **Atrasos (backoff):** 500 ms, 1000 ms, 2000 ms após cada injeção.
- **Máximo de tentativas:** 3 (por alvo de injeção: `{ tabId }` e `{ tabId, allFrames: true }`).

Mensagem à IDE em caso de falha: *"Content script não disponível na aba do Gemini. Recarregue a aba (F5) em gemini.google.com e tente novamente."*

---

## Mapeamento erro técnico → mensagem ao usuário (PT-BR)

Em `lib/messaging.ts`, a função `normalizeExtensionErrorMessage` converte erros técnicos em mensagens em português com ação sugerida:

| Erro técnico (contido na mensagem) | Mensagem exibida ao usuário |
|------------------------------------|-----------------------------|
| "receiving end", "could not establish connection", "não foi possível estabelecer" | "Conexão com a extensão falhou. Recarregue a aba do Gemini (F5) e verifique se a EVA Studio Bridge está instalada." |
| "timeout" | "Tempo esgotado. Verifique se a extensão está instalada, abra gemini.google.com em uma aba e tente novamente." |
| Outros | Mensagem original (a extensão já envia muitas em PT-BR). |

Timeout de waitForCodeFromExtension: *"Tempo esgotado (Xs). Instale a EVA Studio Bridge, abra gemini.google.com em uma aba e recarregue a página do Gemini (F5) se necessário."*

Extensão não detectada (onExtensionNotDetected no ChatSidebar): *"Extensão não detectada. Instale a EVA Studio Bridge e abra uma aba em gemini.google.com."*

---

## Popup

O popup faz um único refresh ao abrir; não há setInterval. Evita trabalho desnecessário após o popup ser fechado.
