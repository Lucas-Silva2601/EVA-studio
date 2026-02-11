# Continuidade da IA no EVA Studio

Este documento descreve as **causas identificadas** que impediam a IA de dar continuidade ao projeto e as **soluções implementadas**.

---

## Fluxo resumido

1. **Analista (Groq/Gemini API)** lê o `checklist.md`, identifica a próxima tarefa e pode responder com "Enviando tarefa 'X' para o Gemini...".
2. A **IDE** envia um prompt técnico ao **Gemini (navegador)** via extensão EVA Bridge.
3. A **extensão** injeta o prompt na aba do Gemini, espera a resposta e extrai blocos de código.
4. A **IDE** recebe o código, abre o Diff para revisão e, ao aceitar, grava no disco e marca `[x]` no checklist.
5. O **loop** pode avançar para a próxima tarefa (manual ou automático).

Qualquer falha em um desses passos interrompe a continuidade.

---

## Causas identificadas e soluções

### 1. Resposta truncada do Analista e falta de reenvio ao Gemini

**Problema:** Quando a resposta do Analista (Groq) era cortada por limite de tokens, o usuário via "Continuar Gerando". O botão pedia apenas a **continuação da resposta do Analista** e atualizava a mensagem no chat. A parte que **envia o prompt ao Gemini** (presente em `handleSend`) não era executada de novo. Assim, se a frase "Enviando tarefa '...' para o Gemini" ou o prompt completo só aparecessem na continuação, o Gemini **nunca recebia** o prompt e a IA não prosseguia.

**Solução:** Após "Continuar Gerando", a IDE agora verifica se a mensagem completa (original + continuação) contém "Enviando tarefa '...' para o Gemini". Em caso positivo, dispara o mesmo fluxo de envio ao Gemini: `getPromptForGemini` + `waitForCodeFromExtension` + abertura do Diff. Assim, mesmo com resposta truncada, o projeto continua após completar a geração.

**Arquivos:** `components/layout/ChatSidebar.tsx` (handler `handleContinueGenerating`).

---

### 2. Fase errada (pular tarefas da Fase 1)

**Problema:** `getCurrentPhaseFromChecklist` retornava a **última** seção `## Fase N` que tivesse pelo menos uma tarefa `[ ]` no documento. Em um checklist com Fase 1 (com pendentes) e Fase 2 (também com pendentes), o retorno era **Fase 2**. A IDE enviava então tarefas da Fase 2 primeiro e **pulava** as pendentes da Fase 1, quebrando a ordem lógica e a continuidade.

**Solução:** Foi criada `getPhaseOfFirstPendingTask(checklistContent)`, que usa `getFirstPendingTaskLine` e `determinePhaseFromTask` para obter a fase da **primeira** tarefa pendente no documento. Os fluxos "Avançar para Próxima Tarefa", os botões "Fase N" e o envio após receber código passaram a usar essa fase quando o objetivo é "próxima tarefa em ordem". A continuidade segue a ordem do checklist.

**Arquivos:** `lib/checklistPhase.ts` (nova função), `components/layout/ChatSidebar.tsx` (uso em `handleAdvanceToNext`, botões de fase e no bloco após receber código do Gemini).

---

### 3. Bloqueio após rejeitar o Diff

**Problema:** Ao enviar uma tarefa ao Gemini e abrir o Diff, a IDE gravava essa tarefa em `lastSentTaskLineRef` para evitar "duplo envio". Ao **rejeitar** o diff, o estado de revisão era limpo, mas `lastSentTaskLineRef` **não** era. Na próxima tentativa de "Executar Fase" ou "Avançar", `canSendTask` continuava false para a mesma tarefa e a mensagem era "Duplo envio bloqueado. Aceite ou rejeite as alterações no diff." O usuário ficava preso, sem poder reenviar a mesma tarefa ao Gemini.

**Solução:** Em `rejectDiffReview` no `useIdeState`, passamos a zerar `lastSentTaskLineRef.current = null` ao rejeitar. A mensagem foi ajustada para informar que as alterações foram rejeitadas e que o usuário **pode reenviar** a tarefa ao Gemini.

**Arquivos:** `hooks/useIdeState.tsx` (callback `rejectDiffReview`).

---

### 4. Extensão e interface do Gemini

**Problema:** A extensão (`chrome-extension/content-gemini.js`) depende de seletores do DOM do Gemini (campo de prompt, botão enviar, ícone Stop/Share, blocos `pre`/`code`). Se a interface do Gemini mudar, a extensão pode não encontrar o input, não detectar o fim da resposta ou extrair código vazio, gerando timeout ou "Erro ao receber código do Gemini".

**Solução (recomendações):**

- Manter a aba do Gemini aberta em `https://gemini.google.com` ao usar "Executar Fase" / "Avançar".
- Se a Google alterar a UI, atualizar os seletores em `content-gemini.js` (ver comentário no topo do arquivo).
- Em caso de timeout (2–3 min), verificar se o Gemini está carregado e se a extensão está ativa na página (ícone/console).

---

### 5. Timeout e handshake

**Problema:** `waitForCodeFromExtension` usa timeout de 2–3 minutos. Se o Gemini demorar muito para responder ou a extensão não conseguir capturar o código, a IDE responde com timeout e a continuidade para.

**Solução (recomendações):**

- Aumentar o timeout em chamadas específicas, se necessário (já há 180000 ms em parte dos fluxos).
- O handshake de 10 s sem resposta dispara tentativa de reconexão (Ping); após falha, é exibido aviso para verificar extensão e aba do Gemini.

---

## Resumo das alterações no código

| Área | Alteração |
|------|-----------|
| **ChatSidebar** | "Continuar Gerando" passa a verificar se a mensagem completa contém envio ao Gemini e, se sim, executa o fluxo de envio ao Gemini (prompt + espera de código + Diff). |
| **ChatSidebar** | Uso de `getPhaseOfFirstPendingTask` em "Avançar", botões de fase e no fluxo após receber código, para seguir a ordem do checklist. |
| **checklistPhase** | Nova função `getPhaseOfFirstPendingTask(checklistContent)` retornando a fase da primeira tarefa `[ ]` no documento. |
| **useIdeState** | Em `rejectDiffReview`, limpeza de `lastSentTaskLineRef` e mensagem informando que o usuário pode reenviar a tarefa. |

---

## Como validar

1. Abrir uma pasta com `checklist.md` (várias fases com tarefas `[ ]`).
2. Usar os botões "Fase N" ou "Avançar para Próxima Tarefa": a próxima tarefa deve ser sempre a **primeira** pendente no arquivo, mesmo que haja pendentes em fases posteriores.
3. Se a resposta do Analista for truncada: clicar em "Continuar Gerando"; após completar, o prompt deve ser enviado ao Gemini e o código aparecer no Diff.
4. Rejeitar o Diff e em seguida clicar de novo em "Executar Fase" ou "Avançar": a mesma tarefa deve poder ser reenviada ao Gemini sem mensagem de "Duplo envio bloqueado".
