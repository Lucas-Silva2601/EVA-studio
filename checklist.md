# Checklist – EVA Studio (projeto)

> Documentação do repositório: estrutura de pastas/arquivos e funcionalidades implementadas.

---

## Estrutura do projeto (pastas e arquivos)

- .eslintrc.json
- .gitignore
- .playwright-mcp/
- .prettierrc
- app/
- app/api/
- app/api/groq/
- app/api/groq/route.ts
- app/globals.css
- app/icon.svg
- app/layout.tsx
- app/page.tsx
- chrome-extension/
- chrome-extension/background.js
- chrome-extension/content-gemini.js
- chrome-extension/content-ide.js
- chrome-extension/manifest.json
- chrome-extension/popup.html
- chrome-extension/popup.js
- chrome-extension/README.md
- components/
- components/editor/
- components/editor/MonacoDiffWrapper.tsx
- components/editor/MonacoWrapper.tsx
- components/file-explorer/
- components/file-explorer/FileTree.tsx
- components/layout/
- components/layout/ArchitectureMapView.tsx
- components/layout/BottomPanel.tsx
- components/layout/ChatCodeBlock.tsx
- components/layout/ChatInput.tsx
- components/layout/ChatPanel.tsx
- components/layout/ChatSidebar.tsx
- components/layout/DeletionModal.tsx
- components/layout/DiffReviewModal.tsx
- components/layout/EditorArea.tsx
- components/layout/GenesisQueuePanel.tsx
- components/layout/Sidebar.tsx
- components/layout/TerminalPanel.tsx
- components/layout/TitleBar.tsx
- docs/
- docs/acessibilidade.md
- docs/design-tokens.md
- hooks/
- hooks/useIdeState.tsx
- hooks/useResize.ts
- hooks/useTheme.tsx
- lib/
- lib/checklistPhase.ts
- lib/contextPacker.ts
- lib/evaActions.ts
- lib/fileSystem.ts
- lib/groq.ts
- lib/monacoWorkers.ts
- lib/indexedDB.ts
- lib/markdownCodeParser.ts
- lib/messaging.ts
- lib/projectType.ts
- lib/runtime.ts
- lib/sanitize.test.ts
- lib/sanitize.ts
- lib/utils.ts
- next-env.d.ts
- next.config.js
- public/
- public/EVA-studio-logo.png
- package-lock.json
- package.json
- postcss.config.js
- README.md
- tailwind.config.ts
- tsconfig.json
- types/
- types/global.d.ts
- types/index.ts
- vitest.config.ts

---

## Funcionalidades implementadas

### IDE e Interface do Usuário

- [x] Layout profissional: interface inspirada no VS Code com painéis redimensionáveis (useResize)
- [x] Editor de código: integração com Monaco Editor para suporte a sintaxe e edição avançada (MonacoWrapper)
- [x] Explorador de arquivos: árvore de arquivos (FileTree) para navegação na estrutura do projeto
- [x] Customização visual: suporte a temas claro e escuro, paleta Cyber-Heat e design tokens (docs/design-tokens.md)
- [x] Terminal interativo: terminal integrado (xterm.js) para execução de comandos e scripts via WebContainer
- [x] Abrir, fechar e alternar arquivos no editor; abas com nome do arquivo
- [x] Salvar arquivo atual (teclado e persistência em disco)
- [x] Painel Output (BottomPanel) para mensagens de fluxo, erros e logs
- [x] Acessibilidade: atalhos, foco visível (docs/acessibilidade.md)
- [x] Live Preview: servidor estático no WebContainer (serve --single) com verificação de index.html na raiz

### Gestão de Sistema de Arquivos (Local)

- [x] Acesso local: integração com File System Access API para manipulação direta de arquivos no computador do usuário
- [x] Persistência: uso de IndexedDB para salvar o handle da pasta aberta; projeto permanece acessível após recarregamento
- [x] Operações CRUD: abrir, ler, escrever, criar, renomear e excluir arquivos e diretórios
- [x] Listagem recursiva (listDirectoryRecursive) com pastas ignoradas (node_modules, .git, .next, etc.)
- [x] Movimentação de arquivo (moveFile)

### Checklist (projeto do usuário)

- [x] Arquivo checklist.md na raiz da pasta aberta; criação com template se não existir
- [x] Leitura e escrita do conteúdo do checklist (readChecklist, writeChecklist)
- [x] Atualização atômica: marcar tarefa [ ] → [x] (updateChecklistOnDisk)
- [x] Seção "Estrutura do projeto" no checklist: preenchida automaticamente ao abrir a pasta com todas as pastas e arquivos (checklistStructure.ts)
- [x] Extração de linhas de tarefas por fase (getPhaseTaskLines, getPhaseTitles) em lib/checklistPhase.ts

### Agentes de IA e Orquestração

- [x] Agente Analista (Groq): orquestração do fluxo, análise do checklist, validação de código e relatórios de erros
- [x] Agente Programador (Gemini): integração via extensão EVA Bridge para geração massiva de código e automação de tarefas
- [x] Chat inteligente: interface de chat para interação com os agentes; chat_to_tasks transforma conversas em tarefas acionáveis
- [x] Rota POST /api/groq: analyze, validate, report_error, chat, chat_to_tasks, mermaid, prompt_for_gemini, suggest_filename
- [x] Chamada à API Groq (llama-3.3-70b-versatile) com retry em 429 e backoff
- [x] prompt_for_gemini: phaseNumber soberano no payload; getCurrentPhaseFromChecklist para fase correta
- [x] Tratamento de resposta truncada e injeção de prompts estruturados; opção "Continuar Gerando"
- [x] API Key apenas no servidor (.env.local GROQ_API_KEY)

### Integração com Google Gemini (extensão Chrome)

- [x] Extensão EVA Bridge: background.js, content-ide.js (IDE), content-gemini.js (Gemini)
- [x] Comunicação IDE ↔ extensão via postMessage (messaging.ts); SEND_PROMPT, CODE_RESPONSE, ERROR
- [x] Injeção de prompt no Gemini e extração de código da resposta (content-gemini.js)
- [x] Envio de prompt à extensão (sendPromptToExtension) e espera de código (waitForCodeFromExtension)
- [x] Resolução de nome de arquivo quando Gemini não retorna FILE: (suggest_filename)
- [x] Popup da extensão (popup.html / popup.js) e README em chrome-extension/README.md

### Loop de Automação e Execução

- [x] Execução por fases: sistema de automação que percorre as etapas do checklist de forma sequencial
- [x] Revisão de mudanças (Diff): DiffReviewModal para o usuário revisar e aprovar alterações antes da aplicação definitiva
- [x] Marcação atômica: updateChecklistOnDisk com prioridade para currentChecklistTask.taskLine ao aceitar diff
- [x] Ações estruturadas (EVA_ACTION): CREATE_FILE/CREATE_DIRECTORY (imediato); DELETE_FILE/DELETE_FOLDER (aprovação humana no DeletionModal); MOVE_FILE (imediato)
- [x] Tratamento de contexto: gerenciamento de respostas truncadas e injeção de prompts estruturados
- [x] Executar Fase: phaseBuffer para múltiplos arquivos; botão "Implementar Fase" grava no disco e marca [x]
- [x] Executar loop: próxima tarefa → prompt para Gemini → código → Diff para revisão → marca [x] no checklist
- [x] Gênesis: fila de arquivos para criar/atualizar (GenesisQueuePanel)

### Ambiente de Execução (Runtime)

- [x] Suporte Node.js: execução de scripts e gerenciamento de pacotes (npm) via WebContainers
- [x] Suporte Python: execução de código Python diretamente no navegador através do Pyodide
- [x] Detecção de projeto: identificação automática da linguagem e framework para configurar o ambiente correto (projectType.ts)
- [x] Executar arquivo atual (Run); output no painel inferior
- [x] Tratamento de erros de execução e opção de enviar ao Analista (Autocura – report_error)

### Segurança e sanitização

- [x] Sanitização de caminhos de arquivo (sanitizeFilePath) para evitar path traversal
- [x] Sanitização de conteúdo de código (sanitizeCodeContent) e limite de tamanho (MAX_CODE_LENGTH)
- [x] Testes unitários para sanitize (lib/sanitize.test.ts, Vitest)
- [x] Validação de origem das mensagens da extensão (window.location.origin)

### Outros

- [x] Parser de blocos de código Markdown (markdownCodeParser.ts) para extrair FILE: e código
- [x] Context packer: árvore indentada + conteúdo de arquivos de texto para contexto do Analista (contextPacker.ts)
- [x] Vista de mapa de arquitetura (ArchitectureMapView) com diagrama Mermaid da árvore
- [x] Ícone estático da aplicação (app/icon.svg) para evitar erro de URL no Windows com ImageResponse
