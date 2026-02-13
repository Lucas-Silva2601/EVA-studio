# Fase 4 — Manutenibilidade da Extensão

## Objetivo

Aumentar a manutenibilidade da extensão EVA Studio Bridge, para que mudanças na UI do Gemini (seletores, estrutura do DOM) e no protocolo IDE ↔ Extensão sejam mais fáceis de localizar, testar e documentar.

## Escopo

- **Incluído:** Estrutura e organização do código da extensão (content-gemini.js, content-ide.js, background.js); documentação centralizada do protocolo de mensagens; checklist de QA para o fluxo principal e cenários de erro.  
- **Fora do escopo:** Implementação de testes automatizados (E2E ou unit) — apenas checklist manual e documentação; mudanças de funcionalidade além da organização.

## Critérios de Conclusão

- [x] Protocolo IDE ↔ Extensão documentado em um único lugar (doc ou comentário mestre) com tipos de mensagem, payloads e quem envia/recebe.  
- [x] Seletores e constantes do Gemini (textarea, botão Send, Stop, Share, blocos de código) concentrados e documentados, para facilitar atualização quando a UI do Gemini mudar.  
- [x] Existe um checklist de QA (fluxo feliz + erros comuns) que pode ser seguido antes de cada release da extensão.  
- [x] Código da extensão organizado em seções claras ou módulos, com responsabilidades bem definidas.

## Tarefas (Checklist)

1. **Documentação do protocolo**  
   - [x] Criar `docs/protocolo-extensao-ide.md` (ou seção em documento existente) com:  
     - Mensagens da IDE → Extensão: `EVA_STUDIO_FROM_PAGE` com payload `EVA_PING` e `EVA_PROMPT_SEND` (formato do payload).  
     - Mensagens da Extensão → IDE: `EVA_EXTENSION_CONNECTED`, `EVA_STUDIO_TO_PAGE` com `EVA_PONG`, `EVA_CODE_RETURNED` (estrutura de payload: code, filename, files, error).  
     - Fluxo Background ↔ Content IDE e Background ↔ Content Gemini (REGISTER_*, EVA_PROMPT_INJECT, EVA_CODE_CAPTURED, EVA_ERROR).  
   - [x] Referenciar tipos em `lib/messaging.ts` e em `types/` para manter contrato único (evitar documentação desatualizada).

2. **Seletores e constantes do Gemini**  
   - [x] Em content-gemini.js, extrair todos os seletores (findPromptInput, findSendButton, isStopVisible, isShareVisible, extractCodeBlocks) para um objeto de configuração no topo do arquivo, por exemplo:  
     `const GEMINI_SELECTORS = { prompt: [...], sendButton: [...], stop: [...], share: [...], codeBlocks: [...] };`  
   - [x] Adicionar comentário no topo ou em docs explicando que esses seletores podem precisar ser atualizados quando a UI do Gemini mudar; indicar como inspecionar a página para obter novos seletores.

3. **Organização do código**  
   - [x] Manter ou introduzir seções claras em content-gemini.js: (1) Config e constantes, (2) Helpers de DOM e seletores, (3) Parsing e extração de código, (4) Captura de resposta (waitForResponseComplete), (5) Handlers de mensagem.  
   - [x] content-ide.js: manter enxuto; garantir que o cabeçalho descreva o protocolo e a origem (EVA_STUDIO_FROM_PAGE / EVA_STUDIO_TO_PAGE).  
   - [x] background.js: agrupar lógica por tipo de mensagem (IDE vs Gemini); documentar em comentário a ordem de registro dos listeners se relevante.

4. **Checklist de QA**  
   - [x] Criar `docs/qa-extensao.md` (ou seção em fase-04) com cenários:  
     - **Fluxo feliz:** IDE em localhost:3000, Gemini aberto → enviar prompt da IDE → código retorna e é aplicado/ exibido na IDE.  
     - **Extensão não instalada:** IDE deve mostrar mensagem clara (ex.: “Extensão não disponível”).  
     - **Gemini não aberto:** IDE deve receber erro “Abra o Google Gemini em uma aba primeiro”.  
     - **Aba do Gemini fechada durante o envio:** Mensagem de erro compreensível e sem erros não tratados no console.  
     - **Extensão atualizada com páginas abertas:** Banner no Gemini “Recarregue a página (F5)”; após F5, fluxo volta a funcionar.  
   - [x] Incluir passos para inspecionar: Service Worker (background), Console da aba IDE, Console da aba Gemini, Popup.

5. **Versão e changelog**  
   - [x] Manter versão no manifest.json alinhada a releases; opcional: arquivo CHANGELOG na pasta chrome-extension ou na raiz do projeto com alterações que afetam a extensão.

## Riscos e Dependências

- **Risco:** Google alterar frequentemente o DOM do Gemini; seletores quebrarem sem aviso.  
  **Mitigação:** Documentar onde estão os seletores e como testar; considerar no futuro um mecanismo de fallback ou detecção de “elemento não encontrado” com mensagem clara ao usuário (já parcialmente feito com “Caixa de prompt não encontrada”).  
- **Dependência:** Fases 1–3 concluídas para que a extensão esteja estável e alinhada ao prompt antes de investir em documentação e organização.

---

## Execução (Fase 4 implementada)

- **docs/protocolo-extensao-ide.md:** Criado com visão geral, mensagens IDE→Extensão (EVA_STUDIO_FROM_PAGE: EVA_PING, EVA_PROMPT_SEND), Extensão→IDE (EVA_EXTENSION_CONNECTED, EVA_PONG, EVA_CODE_RETURNED com estrutura do payload), Background↔Content IDE, Background↔Content Gemini. Referência a `lib/messaging.ts` e `types/index.ts` para contrato único.
- **content-gemini.js:** Objeto `GEMINI_SELECTORS` no topo com `prompt`, `sendButton`, `stop`, `share`; helper `findFirstVisible(selectors, checkDisabled)`; funções de DOM passam a usar os seletores. Comentário no cabeçalho sobre atualizar seletores quando a UI do Gemini mudar e referência a docs/qa-extensao.md. Seções (1) Config e constantes, (2) Helpers de DOM e seletores, (3) Parsing e extração de código, (4) Captura de resposta, (5) Handlers de mensagem.
- **content-ide.js:** Cabeçalho já descreve protocolo e origem; mantido enxuto.
- **background.js:** Comentário no cabeçalho com a ordem dos listeners (IDE, depois Gemini) e uso de `return true` para resposta assíncrona.
- **docs/qa-extensao.md:** Criado com cenários (fluxo feliz, extensão não instalada, Gemini não aberto, aba Gemini fechada durante envio, extensão atualizada com páginas abertas) e passos para inspecionar Service Worker, Console IDE, Console Gemini, Popup; nota sobre atualizar seletores.
- **chrome-extension/CHANGELOG.md:** Criado (opcional) com versão 3.0 e referência ao manifest e à documentação.
