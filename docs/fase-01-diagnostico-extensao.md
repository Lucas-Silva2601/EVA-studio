# Fase 1 — Diagnóstico e Estabilização da Extensão

## Objetivo

Identificar e corrigir os erros que a extensão EVA Studio Bridge v3.0 produz no navegador (console da IDE, do Gemini, do popup e do service worker), garantindo que o fluxo IDE → Background → Gemini → captura de código → IDE funcione de forma estável.

## Escopo

- **Incluído:** Content scripts (content-ide.js, content-gemini.js), background.js (service worker), popup.js/popup.html; mensagens entre IDE (Next.js) e extensão.
- **Fora do escopo:** Mudanças de UI na aplicação Next.js; alterações de funcionalidade (apenas correções de comportamento e erros).

## Erros Conhecidos a Tratar

| Local | Erro típico | Causa provável | Ação |
|-------|-------------|----------------|--------|
| Service worker | `Could not establish connection. Receiving end does not exist` | Content script do Gemini ainda não carregado na aba | Já existe fallback com injeção programática; garantir que `sendResponse` seja chamado mesmo em falha. |
| Background | Resposta assíncrona não entregue à IDE | Listener de mensagem retorna sem manter canal aberto até o async terminar | Garantir `return true` no listener e chamar `sendResponse(...)` no fim do async em todos os caminhos (sucesso, erro, aba não encontrada). |
| Content-ide | Callback de `chrome.runtime.sendMessage` nunca chamado | Página descarregando ou extensão recarregada | Tratar `chrome.runtime.lastError` e notificar a página com erro amigável; evitar dependência do callback para lógica crítica. |
| Content-gemini | `Extension context invalidated` | Extensão atualizada com página do Gemini aberta | Já existe `handleContextInvalidated` e banner; revisar se todos os acessos a `chrome.*` estão protegidos. |
| Popup | Erro ao acessar `chrome.tabs` ou `chrome.storage` | Popup fechado antes de `refresh()` terminar | Envolver `refresh()` em try/catch; verificar se popup está visível antes de atualizar DOM. |
| IDE (Next.js) | Hydration mismatch / avisos de origem | Uso de estado da extensão no primeiro render ou validação de origem restritiva | Garantir que `pingExtension` e listeners de postMessage rodem apenas no client (useEffect); documentar comportamento de origem em dev. |

## Critérios de Conclusão

- [ ] Checklist de erros (acima) revisado e cada item tratado ou documentado como “aceito”.
- [ ] Nenhum erro não tratado no console do service worker ao enviar prompt da IDE para o Gemini (com aba do Gemini aberta e carregada).
- [ ] Popup não gera erros no console ao abrir/fechar rapidamente.
- [ ] Content-ide e content-gemini não deixam listeners órfãos (cleanup em context invalidated / descarregamento).

## Tarefas (Checklist)

1. **Background (background.js)**  
   - [ ] Em todos os handlers que chamam `sendResponse` após trabalho assíncrono, garantir `return true` e chamar `sendResponse` em todos os caminhos (sucesso, falha, timeout).  
   - [ ] Revisar handler `EVA_PROMPT_SEND`: se `findValidGeminiTab()` falhar ou `tryInjectAndSend` falhar, garantir que `sendCodeReturnedToIde` e `sendResponse` sejam invocados antes de retornar.

2. **Content-ide (content-ide.js)**  
   - [ ] No callback de `sendToBackground`, sempre tratar `chrome.runtime.lastError` e, em caso de erro, chamar `notifyPage("EVA_CODE_RETURNED", { error: ... })`.  
   - [ ] Documentar no cabeçalho do arquivo que o listener `chrome.runtime.onMessage` deve retornar `true` quando a resposta for assíncrona (já retorna `false` quando não é EVA_CODE_RETURNED — verificar se está correto).

3. **Content-gemini (content-gemini.js)**  
   - [ ] Garantir que todas as chamadas a `chrome.runtime.sendMessage` e `chrome.runtime.onMessage` estejam protegidas contra context invalidated (já parcialmente feito — revisar `sendToBackground` e o listener de `EVA_PROMPT_INJECT`).  
   - [ ] No listener que chama `handleSendPrompt`, manter `return true` e chamar `sendResponse` após o `handleSendPrompt` concluir (já existe; validar que não há caminho onde sendResponse não é chamado).

4. **Popup (popup.js)**  
   - [ ] Envolver o corpo de `refresh()` em try/catch; em catch, definir status como "Offline" ou "Erro" sem quebrar o popup.  
   - [ ] Opcional: verificar se o documento do popup ainda está no DOM antes de atualizar `ideEl`/`geminiEl` (evitar acesso a nós desconectados).

5. **Documentação**  
   - [ ] Atualizar este documento com qualquer novo erro encontrado durante os testes e a ação tomada.

## Riscos e Dependências

- **Risco:** UI do Gemini (gemini.google.com) mudar seletores (textarea, botão Send, Stop, Share).  
  **Mitigação:** Fase 4 prevê documentar e modularizar seletores; nesta fase apenas garantir que erros sejam reportados à IDE de forma clara.
- **Dependência:** Testes manuais em ambiente real (Chrome com extensão carregada, IDE em localhost, Gemini aberto). Recomenda-se executar o fluxo completo após cada alteração.
