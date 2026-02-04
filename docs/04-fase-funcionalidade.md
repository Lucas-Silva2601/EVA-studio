# Fase 4 – Funcionalidade

Checklist de ações para melhorar e documentar as funcionalidades da IDE, da API e da extensão Chrome.

---

## 4.1 IDE – Explorador e arquivos

- [ ] **File System Access API**: `lib/fileSystem.ts` usa `showDirectoryPicker`, leitura/escrita via handles. Garantir que erros de permissão ou arquivo inexistente sejam tratados e exibidos ao usuário (Output ou toast).
- [ ] **Persistência do handle**: `lib/indexedDB.ts` persiste o Directory Handle no Chrome. Documentar que isso só funciona em navegadores que suportam; em outros, o usuário precisará reabrir a pasta após refresh.
- [ ] **Checklist**: criação e leitura de `checklist.md` na raiz da pasta aberta estão em fileSystem e useIdeState. Garantir que o template inicial seja claro e que marcar `[x]` persista no disco após validação.

---

## 4.2 IDE – Editor e execução

- [ ] **Monaco**: `MonacoWrapper.tsx` e integração com uso de arquivos abertos. Verificar se linguagem (syntax highlight) é detectada corretamente por extensão de arquivo (`lib/utils.ts` – `getLanguageFromFilename`).
- [ ] **Execução (Fase 8)**: `lib/runtime.ts` – Node no WebContainer e Python no Pyodide. Garantir que a saída (stdout/stderr) apareça no Output e que erros de inicialização (ex.: WebContainer não suportado) sejam informados ao usuário.
- [ ] **Headers COOP/COEP**: next.config.js já define headers para WebContainers. Manter; sem eles a execução no browser falha.

---

## 4.3 API Groq (Analista)

- [ ] **Rotas**: `app/api/groq/route.ts` trata ações (analyze, chat, validate, etc.) via body `action` e `payload`. Manter tratamento de erro quando `GROQ_API_KEY` estiver ausente e retornar mensagem clara (não expor detalhes internos).
- [ ] **Truncagem**: chat com o Analista pode retornar resposta truncada; o cliente já usa `is_truncated`. Garantir que a UI informe o usuário quando a resposta for cortada (ex.: "Resposta truncada; continue no chat se necessário").
- [ ] **Blocos de código abertos**: a rota já trata `hasOpenCodeBlock` e pode fazer follow-up. Manter lógica para evitar JSON ou código incompleto no fluxo de análise.

---

## 4.4 Extensão Chrome

- [ ] **Manifest**: `chrome-extension/manifest.json` declara `content-gemini.js` (AI Studio/Gemini) e `content-ide.js` (IDE). Hosts e permissões estão limitados ao necessário; revisar ao adicionar funcionalidades.
- [ ] **Contrato de mensagens**: IDE envia `EVA_STUDIO_FROM_PAGE` + `EVA_PROMPT_SEND`; extensão devolve `EVA_STUDIO_TO_PAGE` + `EVA_CODE_RETURNED` (ou erro). Documentar em `lib/messaging.ts` e no README da extensão; manter compatibilidade ao evoluir payloads.
- [ ] **Seletores do Gemini**: `content-gemini.js` depende de seletores da página do Google AI Studio. Se a interface mudar, atualizar seletores e documentar em `chrome-extension/README.md` (e no README principal, com nome correto do arquivo: `content-gemini.js`).

---

## 4.5 Fluxos principais

- [ ] **Loop de automação**: Analista → próxima tarefa → prompt → extensão → Gemini → código → IDE (salvar/validar/atualizar checklist). Garantir que falhas (extensão não instalada, aba fechada, API Groq indisponível) sejam tratadas e exibidas no Output ou no Chat.
- [ ] **Diff e revisão (Fase 9/10)**: proposta de mudança (chat ou entrega de fase) abre DiffReviewModal; usuário aceita ou rejeita. Ao aceitar, gravar no disco e, quando aplicável, atualizar checklist. Garantir que múltiplos arquivos (Fase 10) sejam todos aplicados e que `phaseLines` seja marcado corretamente.
- [ ] **Autocura (Fase 12)**: após erro de execução, o Analista sugere correção; o Chat exibe "Aplicar Autocura". Garantir que o conteúdo sugerido seja aplicável e que o fluxo não quebre se o usuário rejeitar.

---

## 4.6 Segurança e sanitização

- [ ] **sanitize.ts**: path traversal e limite de tamanho de conteúdo já tratados. Revisar sempre que adicionar novos pontos de escrita em disco (ex.: criação de arquivos a partir do Chat).
- [ ] **Origem das mensagens**: em `lib/messaging.ts` (ou onde o postMessage é tratado), validar `event.origin === window.location.origin` para mensagens da extensão. Manter essa verificação.

---

*Fase 4 concluída quando os fluxos principais estiverem estáveis, erros tratados e documentação da API e da extensão alinhada ao código.*
