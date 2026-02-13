# Fase 5 — Performance e UX

## Objetivo

Melhorar a performance do fluxo IDE ↔ Extensão ↔ Gemini e a experiência do usuário, reduzindo espera desnecessária, tornando retentativas mais inteligentes e exibindo mensagens de erro mais claras e acionáveis.

## Escopo

- **Incluído:** Polling e intervalos na extensão (content-gemini, background); estratégia de retry ao injetar content script no Gemini; mensagens de erro exibidas na IDE (toast, painel, modal); tempo de handshake e timeout.  
- **Fora do escopo:** Performance do Next.js em geral (build, render); otimizações no Gemini (fora do nosso controle).

## Critérios de Conclusão

- [x] Intervalos e timeouts da extensão revisados: não há polling mais agressivo que o necessário; debounces mantidos para evitar captura prematura.  
- [x] Retry de injeção do content script no Gemini usa atrasos claros (ex.: backoff) e número máximo de tentativas documentado.  
- [x] Mensagens de erro na IDE são curtas, em português, e indicam ação sugerida (ex.: “Recarregue a aba do Gemini (F5)” em vez de apenas “Receiving end does not exist”).  
- [x] Timeout de espera por código (waitForCodeFromExtension) e handshake (ping) documentados e, se necessário, ajustados com base em uso real.

## Tarefas (Checklist)

1. **Polling e intervalos (content-gemini.js)**  
   - [x] Revisar `REGISTER_INTERVAL_MS` (45s): se for suficiente para manter a aba registrada sem sobrecarga, manter; caso contrário, documentar o valor e o motivo.  
   - [x] Revisar `POLL_INTERVAL_MS` (200), `DEBOUNCE_AFTER_STOP_MS` (350), `DEBOUNCE_AFTER_SHARE_MS` (250) e `CAPTURE_TIMEOUT_MS` (90s): garantir que não causem captura prematura nem espera excessiva; documentar no código ou em docs.  
   - [x] MutationObserver em waitForResponseComplete: já observa body com childList, subtree, characterData; confirmar que não há vazamento (disconnect no resolve e no timeout).

2. **Background — retry de injeção**  
   - [x] Em tryInjectAndSend, os delays atuais são [600, 1200, 2200] ms. Considerar backoff explícito (ex.: 500, 1000, 2000) e número máximo de tentativas (ex.: 3); documentar.  
   - [x] Se a injeção falhar após todas as tentativas, a mensagem enviada à IDE deve ser clara: “Content script não disponível na aba do Gemini. Recarregue a aba (F5) em gemini.google.com e tente novamente.” (já existe; validar que o usuário final vê essa mensagem e não um stack trace).

3. **IDE — mensagens de erro**  
   - [x] Garantir que todos os caminhos de erro em waitForCodeFromExtension e onExtensionMessage resultem em mensagem em português exibida na UI (painel de chat, toast ou área de status).  
   - [x] Mapear erros técnicos (ex.: “Could not establish connection”, “Receiving end does not exist”) para mensagens amigáveis no ponto onde a IDE recebe o payload com `error`.  
   - [x] Revisar texto de “Extensão não detectada” e “Timeout: extensão não respondeu em Xs” para incluir ação sugerida (instalar extensão, abrir Gemini, recarregar aba).

4. **Timeouts e handshake**  
   - [x] Documentar em messaging.ts ou em docs: PING_TIMEOUT_MS (10s), EXTENSION_HANDSHAKE_MS (10s), timeout padrão de waitForCodeFromExtension (120s), RECONNECT_PING_ATTEMPTS (2).  
   - [x] Se usuários reportarem timeout frequente em respostas longas do Gemini, considerar aumentar o timeout padrão ou expor configuração (fase futura).

5. **Popup**  
   - [x] Popup não precisa de polling contínuo; refresh único ao abrir é suficiente. Garantir que não há setInterval no popup que cause trabalho desnecessário após fechar.

6. **Documentação**  
   - [x] Atualizar fase-05 ou docs com: valores finais de timeouts/intervalos, estratégia de retry e mapeamento erro técnico → mensagem ao usuário.

## Riscos e Dependências

- **Risco:** Reduzir demais o polling em content-gemini pode atrasar a detecção de “resposta pronta”; aumentar demais pode impactar performance em máquinas lentas.  
  **Mitigação:** Manter valores atuais que já funcionam; documentar e, se houver métricas de uso, ajustar em ciclo posterior.  
- **Dependência:** Fases 1–4 concluídas para que a base esteja estável e documentada antes de refinar performance e textos de UX.

---

## Execução (Fase 5 implementada)

- **content-gemini.js:** Comentário em REGISTER_INTERVAL_MS (45s suficiente sem sobrecarga). Comentário em POLL/DEBOUNCE/CAPTURE_TIMEOUT (evita captura prematura e espera excessiva). Comentário em waitForResponseComplete confirmando que MutationObserver e interval são desconectados (sem vazamento).
- **background.js:** Backoff explícito `RETRY_DELAYS_MS = [500, 1000, 2000]` e `MAX_INJECT_ATTEMPTS = 3`; mensagem à IDE em falha já clara (usuário vê texto PT-BR, não stack trace).
- **lib/messaging.ts:** Constantes agrupadas e documentadas: PING_TIMEOUT_MS (10s), EXTENSION_HANDSHAKE_MS (10s), DEFAULT_WAIT_FOR_CODE_TIMEOUT_MS (120s), RECONNECT_PING_ATTEMPTS (2). Função `normalizeExtensionErrorMessage(raw)` mapeia "receiving end", "could not establish connection" e "timeout" para mensagens em PT-BR com ação sugerida; usada em EVA_CODE_RETURNED (handler) e em waitForCodeFromExtension (resolve). Mensagem de timeout reescrita: "Tempo esgotado (Xs). Instale a EVA Studio Bridge, abra gemini.google.com em uma aba e recarregue a página do Gemini (F5) se necessário."
- **ChatSidebar:** Mensagem de onExtensionNotDetected já inclui ação ("Instale a EVA Studio Bridge e abra uma aba em gemini.google.com"); result.error exibido na UI vem normalizado de waitForCodeFromExtension.
- **popup.js:** Comentário no cabeçalho: refresh único ao abrir, sem setInterval.
- **docs/performance-ux-extensao.md:** Criado com tabelas de timeouts/handshake (messaging), polling e captura (content-gemini), retry de injeção (background), mapeamento erro técnico → PT-BR e nota sobre o popup.
