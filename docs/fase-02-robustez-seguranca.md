# Fase 2 — Robustez e Segurança

## Objetivo

Reforçar a robustez e a segurança da comunicação entre a IDE (Next.js) e a extensão Chrome, e do uso da extensão nas páginas do Gemini, em conformidade com as diretrizes de segurança do `prompt.md` (nunca expor segredos, sanitizar inputs, validação de origem).

## Escopo

- **Incluído:** Validação de origem e formato das mensagens postMessage (IDE ↔ content-ide); tratamento seguro de payloads no background e nos content scripts; revisão de logs para não expor dados sensíveis; sanitização de conteúdo antes de repassar à IDE.
- **Fora do escopo:** Autenticação OAuth ou tokens do Gemini (não gerenciados pela extensão); alterações de infraestrutura (HTTPS, CORS).

## Diretrizes do prompt.md Relevantes

- Nunca exponha segredos ou chaves de API no código; use variáveis de ambiente.
- Sanitize inputs de usuários antes de usar em queries ou renderizar em HTML.
- Fail fast: valide inputs no topo da função.
- Em catch blocks, logue o erro com metadados úteis, não apenas `console.error(err)`.

## Critérios de Conclusão

- [x] Mensagens postMessage na IDE validam origem (e opcionalmente tipo) de forma consistente; comportamento em dev (localhost com porta) documentado.
- [x] Payloads recebidos do Gemini (código capturado) são tratados de forma segura antes de enviar à IDE (evitar XSS ou injeção quando a IDE exibir/executar conteúdo).
- [x] Logs não incluem trechos de prompt ou código do usuário em nível que permita vazamento; erros logados com identificadores úteis (ex.: tabId, type da mensagem), não dados sensíveis.
- [x] Content-ide e content-gemini validam tipo e estrutura mínima das mensagens antes de processar.

## Tarefas (Checklist)

1. **IDE — messaging.ts**  
   - [x] Revisar validação `event.origin !== window.location.origin`: em dev, garantir que localhost:3000 e 127.0.0.1:3000 (e portas 3001) sejam aceitos conforme host_permissions da extensão; documentar em comentário.  
   - [x] Validar que `data.payload` existe e que `type` e `payload` estão presentes antes de chamar o handler; fail fast para formato inválido.  
   - [x] Não logar o conteúdo completo do prompt em produção (ou usar flag de debug); manter apenas `promptLength` ou similar.

2. **Content-ide.js**  
   - [x] Ao receber `EVA_STUDIO_FROM_PAGE`, validar que `data.payload` é objeto e que `type` é uma string conhecida (EVA_PING, EVA_PROMPT_SEND); ignorar mensagens malformadas.  
   - [x] Ao notificar a página com `EVA_CODE_RETURNED`, garantir que o payload não contém referências a objetos do contexto da extensão (apenas dados serializáveis).  
   - [x] Evitar `postMessage(..., '*')` se for possível restringir ao origin da página (já usa `window.location.origin` para TO_PAGE; para EVA_EXTENSION_CONNECTED o uso de '*' pode ser mantido com justificativa no comentário — handshake inicial).

3. **Content-gemini.js**  
   - [x] Em `handleSendPrompt`, validar que `payload?.prompt` existe e é string; limitar tamanho máximo do prompt se houver limite conhecido da UI do Gemini (opcional, documentar).  
   - [x] Ao enviar `EVA_CODE_CAPTURED` / arquivos para o background, não incluir dados que não sejam necessários à IDE; garantir que `files[].content` seja string (já é).

4. **Background.js**  
   - [x] Validar `message.source` e `message.type` antes de processar; não confiar em payload sem verificação mínima de estrutura.  
   - [x] Em catch blocks, logar `err?.message` e identificador de contexto (ex.: tabId, type), sem logar o corpo do prompt ou código capturado.

5. **Sanitização para a IDE**  
   - [x] O código e arquivos retornados pela extensão são exibidos/gravados pela IDE; garantir que a aplicação Next.js (ou lib/sanitize) trate conteúdo antes de inserir no DOM ou em arquivos (a extensão pode apenas repassar; a responsabilidade de sanitização pode ficar na IDE — documentar onde é feita e garantir que existe).

6. **Documentação**  
   - [x] Atualizar comentários no código ou um doc interno com: origens aceitas para postMessage, tamanhos máximos (se houver), e onde a sanitização é aplicada (IDE vs extensão).

## Riscos e Dependências

- **Risco:** Restringir demais a origem em dev (por exemplo, iframe ou tunnel) pode quebrar cenários de desenvolvimento.  
  **Mitigação:** Manter whitelist de origens (localhost, 127.0.0.1, portas 3000/3001) e documentar.
- **Dependência:** Fase 1 concluída para que os fluxos de mensagem estejam estáveis antes de endurecer validações.

---

## Execução (Fase 2 implementada)

- **messaging.ts:** Criada whitelist `ALLOWED_ORIGINS` (localhost e 127.0.0.1 nas portas 3000 e 3001) e função `isAllowedOrigin`; mensagens aceitas só se `event.origin` estiver na whitelist ou for `window.location.origin`. Validação fail fast: `data.payload` deve ser objeto e ter propriedade `type` antes de processar. Comentário no cabeçalho sobre origens e sanitização; log do prompt mantém apenas `promptLength`.
- **content-ide.js:** Validação de `payload` como objeto e `type` em `EVA_PING` ou `EVA_PROMPT_SEND`; prompt coercido a string. Comentário justificando `*` em `EVA_EXTENSION_CONNECTED` (handshake inicial). Comentário em `notifyPage` indicando que apenas dados serializáveis são enviados.
- **content-gemini.js:** Em `handleSendPrompt`, `payload.prompt` validado como string (coerção de tipo); comentário sobre limite de tamanho do prompt (não aplicado; UI do Gemini pode impor).
- **background.js:** `payload` extraído apenas quando `message.payload` é objeto; em `EVA_ERROR` usa apenas `payload.message` como string. Logs de catch com contexto: `tabId`, `type`, `err?.message` (sem corpo de prompt ou código).
- **Sanitização:** Confirmado que `lib/sanitize.ts` e `hooks/useIdeState.tsx` aplicam `sanitizeFilePath` e `sanitizeCodeContent` ao gravar arquivos da extensão.
- **Documentação:** Criado `docs/seguranca-extensao.md` com origens aceitas, validação de payload, tamanhos máximos e onde a sanitização é aplicada (IDE).
