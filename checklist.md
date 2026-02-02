# Checklist – IDE Autônoma com Agente de IA (EVA Studio)

> **Arquivo central de controle do projeto.** O Agente Único (Groq) lê este arquivo, tem visão total do projeto (árvore de arquivos + conteúdo) e atua como Analista e Programador: sugere código e o caminho onde salvar. A IDE usa exclusivamente a API Groq (sem extensão Chrome nem AI Studio).

---

## Princípios e Boas Práticas

- [x] O código deve seguir **boas práticas de organização e estruturação de software** (separação de responsabilidades, nomes claros, modularização).
- [x] Manter **estrutura de pastas consistente** e convenções de nomenclatura (kebab-case para arquivos, PascalCase para componentes React).
- [x] Documentar funções e módulos críticos com JSDoc ou comentários objetivos.
- [x] Evitar lógica duplicada; extrair utilitários e hooks reutilizáveis.
- [x] Garantir **acessibilidade** (ARIA, contraste, navegação por teclado) na interface da IDE.
- [x] Tratar erros e estados de carregamento de forma explícita na UI e nas chamadas de API.

---

## Fase 1 – Estrutura e Layout da IDE (Frontend)

### 1.1 Inicialização do Projeto

- [x] Criar projeto Next.js com App Router e TypeScript.
- [x] Configurar Tailwind CSS e tema escuro inspirado no VS Code.
- [x] Instalar dependências: `@monaco-editor/react`, `lucide-react`, e demais necessárias.
- [x] Definir estrutura de pastas: `app/`, `components/`, `lib/`, `hooks/`, `types/`.

### 1.2 Layout Base (Inspirado no VS Code)

- [x] Implementar layout principal com três áreas: barra lateral esquerda, editor central, painel inferior.
- [x] Criar componente de **Barra Lateral** (Sidebar) com largura redimensionável.
- [x] Criar componente de **Área Central** para o Monaco Editor (ocupando espaço principal).
- [x] Criar componente de **Painel Inferior** (Terminal/Output) com altura redimensionável.
- [x] Implementar **barra de título** com nome do projeto e ações (Abrir pasta, Executar arquivo, etc.).
- [x] Garantir layout responsivo e uso correto de CSS Grid/Flexbox com Tailwind.

### 1.3 Explorador de Arquivos (Sidebar)

- [x] Exibir árvore de arquivos da pasta aberta (estrutura hierárquica).
- [x] Permitir expandir/colapsar pastas.
- [x] Ao clicar em um arquivo, abrir no editor central.
- [x] Destacar arquivo atualmente aberto na árvore.
- [x] Ícones por tipo de arquivo (HTML, CSS, JS, TS, Python, etc.) usando Lucide React.
- [x] Exibir indicador quando nenhuma pasta estiver aberta (ex.: "Nenhuma pasta selecionada").

### 1.4 Editor de Código (Monaco)

- [x] Integrar `@monaco-editor/react` na área central.
- [x] Configurar suporte a sintaxe para: HTML, CSS, JavaScript, TypeScript, React (JSX/TSX), Python.
- [x] Suportar múltiplas abas (um arquivo por aba) ou modelo single-tab conforme definição.
- [x] Aplicar tema escuro consistente com o restante da IDE.
- [x] Habilitar line numbers, word wrap opcional e minimap conforme configuração.
- [x] Garantir que o conteúdo do editor seja vinculado ao arquivo aberto (leitura/escrita).

### 1.5 Painel Inferior (Terminal / Output)

- [x] Reservar área para "Terminal" ou "Output" (logs do sistema, mensagens do Agente, erros).
- [x] Exibir mensagens do fluxo (ex.: "Analisando checklist...", "Escrevendo...").
- [x] Permitir abrir/fechar o painel e redimensionar altura.

---

## Fase 2 – Lógica de Arquivos (File System Access API)

### 2.1 Abertura e Permissões

- [x] Implementar botão/ação "Abrir pasta local" que chama `window.showDirectoryPicker()`.
- [x] Armazenar referência ao handle do diretório (estado global ou context) para uso posterior.
- [x] Tratar cenários de cancelamento pelo usuário e falha de permissão.
- [x] Exibir caminho ou nome da pasta aberta na UI (barra de título ou sidebar).
- [x] Garantir uso em contexto seguro (HTTPS ou localhost) conforme requisito da API.

### 2.2 Listagem e Leitura/Escrita

- [x] Função para listar recursivamente arquivos e pastas do diretório selecionado.
- [x] Função para ler e escrever conteúdo de arquivos dado path relativo à raiz.
- [x] Função para criar novo arquivo (e pastas intermediárias se necessário).
- [x] Ignorar pastas como `node_modules`, `.git` na listagem (configurável).
- [x] Atualizar a árvore quando arquivos forem criados/removidos (ex.: após salvamento via Diff/Review).

### 2.3 Arquivo Central checklist.md

- [x] Garantir que o projeto espere um arquivo `checklist.md` na raiz da pasta aberta.
- [x] Se não existir, criar `checklist.md` inicial com template ou instruções.
- [x] Ler e escrever `checklist.md` exclusivamente via File System Access API (sem backend).

---

## Fase 3 – Integração com o Agente (Groq)

### 3.1 Configuração da API Groq

- [x] Configurar variável de ambiente para API Key da Groq (server-side: `GROQ_API_KEY` em `.env.local`).
- [x] Criar módulo em `lib/groq.ts` e rota `/api/groq` para chamadas à API (chave nunca exposta no frontend).
- [x] Escolher modelo (ex.: Llama 3.3 70B) e documentar no código.
- [x] Tratar erros de rede e limites de taxa da API.

### 3.2 Leitura e Análise do checklist.md

- [x] Implementar função que lê o conteúdo de `checklist.md` (usando lógica de arquivos da Fase 2).
- [x] Enviar conteúdo ao Groq com prompt estruturado: analisar checklist e retornar **próxima tarefa pendente** (linha com `[ ]`).
- [x] Parsear resposta do Groq para extrair: descrição da tarefa, sugestão de arquivo ou escopo.
- [x] Exibir no painel inferior (Output) o resultado da análise quando aplicável.

### 3.3 Validação e Atualização do checklist.md

- [x] Após o usuário aprovar alterações via Diff/Review e salvar no disco, o Agente (Groq) pode validar o arquivo.
- [x] Prompt ao Groq: comparar tarefa do checklist com o conteúdo do arquivo; decidir se está correto.
- [x] Se aprovado: atualizar `checklist.md` substituindo `[ ]` por `[x]` na linha da tarefa concluída.
- [x] Persistir alteração no disco via File System Access API.

---

## Fase 4 & 5 – Agente Nativo Groq (Sem Extensão)

### 4.1 Integração Direta via API

- [x] **Descontinuar** a lógica de extensão Chrome e o uso do Google AI Studio.
- [x] Utilizar **exclusivamente a API do Groq** como Agente Único (Analista e Programador).
- [x] Todas as chamadas ao Agente passam pela rota `/api/groq` com ações: `chat`, `chat_to_tasks`, `analyze`, `validate`, `report_error`, `generate_prompt` (quando necessário para compatibilidade).

### 4.2 Contexto Global (Grounding)

- [x] Implementar **Contexto Global** em todas as chamadas de chat: a função de chat deve sempre incluir, antes de responder:
  - **Árvore de arquivos** do projeto (lista de nomes de arquivos e pastas).
  - **Conteúdo dos arquivos** relevantes (.js, .ts, .html, .css, .py, .md) até um limite de caracteres (ex.: `getProjectContext()` em `lib/contextPacker.ts`).
  - **Conteúdo do arquivo aberto** no editor (path + conteúdo).
  - **Conteúdo do checklist.md** (para o Agente ter visão total do projeto e das tarefas).
- [x] O Agente (Groq) tem "visão total" do projeto e é responsável por sugerir o código e o **caminho (path)** onde ele deve ser salvo.

### 4.3 Fluxo de Tarefas (Sem Loop Automático via Extensão)

- [x] O usuário interage pelo **Chat** (painel direito): envia mensagens e recebe respostas do Agente com sugestões de código.
- [x] Quando o usuário clica em **"Traduzir em tarefas"**, o Agente atualiza o `checklist.md` com novas linhas e, em seguida, pode propor o código da primeira tarefa pendente diretamente no chat (com botão "Implementar").
- [x] Não há envio de prompt para o AI Studio nem espera de código via extensão; todo código é gerado pelo Groq e exibido no chat.

---

## Fase 6 – Refino, Segurança e Documentação

### 6.1 Segurança e Boas Práticas

- [x] Nunca expor API Key da Groq no frontend de produção; usar apenas rotas API do Next.js.
- [x] Sanitizar paths e conteúdo antes de escrever em disco (`lib/sanitize.ts`).
- [x] Validar e limitar tamanho de arquivos/código quando necessário.

### 6.2 Documentação

- [x] README.md com: objetivo do projeto, arquitetura (IDE + Groq como Agente Único), como rodar (npm install, npm run dev).
- [x] Como obter e configurar API Key da Groq e onde colocá-la (`.env.local`).
- [x] Descrição do formato esperado de `checklist.md` e exemplo de uso do chat e do botão "Implementar".

---

## Fase 7 – Persistência e Contexto Avançado

### 7.1 Persistência do Directory Handle (IndexedDB)

- [x] Implementar IndexedDB para salvar o **Directory Handle** da pasta aberta.
- [x] No carregamento da IDE, tentar restaurar o handle; verificar permissão antes de usar.
- [x] Evitar que o usuário precise reselecionar a pasta a cada refresh.

### 7.2 Project Context (Árvore + Conteúdo)

- [x] **Project Context Packer**: função que resume a árvore de arquivos e extrai assinaturas (para briefing técnico quando necessário).
- [x] **getProjectContext()**: função que lê recursivamente os arquivos de texto relevantes (.js, .ts, .html, .css, .py, .md) e retorna árvore + conteúdo completo para envio ao Groq no chat, garantindo que o Agente tenha visão total do projeto.

---

## Fase 8 – Execução e Validação em Tempo Real

### 8.1 Ambiente de Execução na IDE

- [x] Integrar **WebContainers** (Node.js) ou **Pyodide** (Python) para rodar código dentro da IDE.
- [x] Exibir saída (stdout/stderr) no painel Terminal/Output.

### 8.2 Feedback ao Agente em Caso de Erro

- [x] Quando o código executado falhar, capturar mensagem de erro e stack.
- [x] Enviar o erro ao Agente (Groq) com contexto: tarefa, arquivo, mensagem de erro; o Agente pode sugerir correção no chat.

---

## Fase 9 – Resiliência e Interface de Confiança

### 9.1 Diff/Review (Human-in-the-loop)

- [x] **Sistema de Diff/Review**: antes de salvar um arquivo sugerido pela IA no disco, exibir comparação **antes/depois** (conteúdo atual vs. conteúdo novo).
- [x] Permitir **aprovação humana**: botões "Aceitar tudo", "Rejeitar tudo" ou "Editar manualmente"; só gravar em disco após Aceitar (ou após edição).
- [x] Se o arquivo não existia, mostrar "novo arquivo" com conteúdo completo para revisão.
- [x] Suportar múltiplos arquivos em uma única revisão (um diff por arquivo).

### 9.2 Detecção de Loop de Erro

- [x] Contar falhas consecutivas na mesma tarefa; após 3 falhas, interromper e solicitar intervenção humana.
- [x] Resetar o contador quando o usuário alterar o checklist ou aprovar manualmente uma alteração.

---

## Fase 10 – Parsing de Múltiplos Arquivos

### 10.1 Parser de Resposta Markdown

- [x] Parser capaz de extrair **múltiplos blocos de código** de uma resposta do Agente.
- [x] Identificar **nome/caminho de arquivo** por convenção: comentário `// FILE: path/to/file` ou `// filename: path` no início do bloco.
- [x] Produzir lista de `{ name: string, content: string }[]` para a IDE salvar vários arquivos quando aplicável.
- [x] Integrar ao fluxo de Diff/Review: exibir diff por arquivo e salvar após aprovação.

### 10.2 Roteamento por Path

- [x] O Agente inclui o caminho completo (ex.: `src/components/Button.tsx`) na sugestão de código (via `// FILE:`).
- [x] A IDE usa o path para salvar no lugar correto, criando subpastas se necessário.
- [x] Após salvamento (diff aprovado), atualizar o estado do editor (openFiles) para refletir o conteúdo gravado.

---

## Fase 11 – Interface de Chat EVA à Direita

### 11.1 Posicionamento do Chat

- [x] **Chat EVA** posicionado na **extremidade direita** do layout principal (não na sidebar esquerda).
- [x] Layout: **Sidebar esquerda** (Explorador) | **Editor central + Output** | **Chat direito**.
- [x] Chat com **altura total** (mesma altura da área de trabalho) e **largura redimensionável**.

### 11.2 ResizeHandle entre Editor e Chat

- [x] Implementar **ResizeHandle** (alça de redimensionamento) entre o **Editor Central** e o **Chat da direita**.
- [x] Arrastar a alça para aumentar ou diminuir a largura do painel de Chat; persistir valor no `localStorage` (ex.: `eva-chat-width`).

### 11.3 Componente de Chat

- [x] Componente `ChatSidebar` em `components/layout/ChatSidebar.tsx`, integrado ao **ChatPanel** (painel direito).
- [x] Interface: histórico de mensagens, campo de entrada, botão Enviar; indicador do arquivo aberto no editor quando relevante.
- [x] **Contraste**: mensagens do chat com `text-zinc-50` sobre fundo escuro para legibilidade máxima.
- [x] Scrollbars visíveis e estilizadas no Chat (`overflow-y-auto`, `scrollbar-thin`).

### 11.4 Histórico e Contexto

- [x] O chat mantém o histórico da conversa (mensagens usuário e assistente) no estado do componente.
- [x] Ao enviar mensagem, o Agente recebe **Contexto Global**: árvore de arquivos, conteúdo do projeto (getProjectContext), arquivo aberto, checklist.md.
- [x] O Agente responde com base nesse contexto (visão total do projeto).

### 11.5 Botão "Traduzir em tarefas"

- [x] Botão **"Traduzir em tarefas"** (ou "Traduzir em tarefas e executar"): o usuário dá uma ordem no chat; o Agente traduz em novas linhas de checklist (formato `- [ ] descrição`).
- [x] A IDE anexa essas linhas ao `checklist.md` e persiste no disco.
- [x] Em seguida, a IDE pode solicitar ao Agente que **proponha o código da primeira tarefa pendente** diretamente no chat, com o botão "Implementar" disponível (ver Fase 11.5).

---

## Fase 11.5 – Sistema de Implementação com Um Clique

### 11.5.1 Parser do Cabeçalho // FILE:

- [x] Parser para identificar o **cabeçalho** `// FILE: path/to/file` (ou `// filename: path`) nas respostas de código da IA.
- [x] O Agente é instruído (system prompt) a sempre usar `// FILE: caminho/do/arquivo` no início de cada bloco de código ao propor alterações.
- [x] Remover essa linha ao gravar o arquivo (não salvar o comentário como parte do conteúdo do arquivo).

### 11.5.2 Botão "Implementar" no Chat

- [x] Abaixo de **cada bloco de código** no chat que contenha o cabeçalho `// FILE:`, exibir um botão azul **"Implementar Mudanças"** (ou "Implementar").
- [x] Componente `ChatCodeBlock` que renderiza o código e o botão quando o path é detectado.

### 11.5.3 Vinculação ao Diff/Review (Fase 9)

- [x] Ao clicar em **"Implementar"**, a IDE identifica o caminho do arquivo no cabeçalho do código.
- [x] Abrir o **Modal de Diff/Review** (Fase 9) com o conteúdo atual do arquivo (se existir) e o conteúdo proposto (código sem a linha `// FILE:`).
- [x] Após aprovação do usuário, gravar o novo conteúdo no disco via File System Access API e atualizar a árvore e o editor.

---

## Resumo da Estrutura de Pastas do Projeto

```
EVA-studio/
├── checklist.md                 # Controle do projeto (Agente Groq lê/escreve)
├── README.md
├── .env.example / .env.local    # GROQ_API_KEY (não versionado)
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # MainLayout: Sidebar | Editor+Output | ChatPanel (direita)
│   ├── globals.css
│   └── api/groq/route.ts        # Rota API do Agente Único (Groq)
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx          # Explorador (esquerda)
│   │   ├── EditorArea.tsx
│   │   ├── BottomPanel.tsx      # Output
│   │   ├── TitleBar.tsx
│   │   ├── ChatPanel.tsx        # Container do Chat (direita, resize)
│   │   ├── ChatSidebar.tsx      # Chat EVA + botão Traduzir em tarefas
│   │   ├── ChatCodeBlock.tsx    # Blocos de código + botão Implementar
│   │   └── DiffReviewModal.tsx  # Fase 9: Diff/Review
│   ├── file-explorer/FileTree.tsx
│   └── editor/MonacoWrapper.tsx
├── lib/
│   ├── groq.ts                  # Cliente Groq (chat, chat_to_tasks, analyze, validate, etc.)
│   ├── fileSystem.ts
│   ├── contextPacker.ts        # getProjectContext, treeToIndentedText, packProjectContext
│   ├── markdownCodeParser.ts   # Parser // FILE: e múltiplos blocos
│   ├── sanitize.ts
│   ├── indexedDB.ts
│   ├── projectType.ts
│   └── runtime.ts              # WebContainers + Pyodide
├── hooks/
│   ├── useIdeState.tsx         # Estado global + proposeChangeFromChat
│   └── useResize.ts
└── types/index.ts
```

---

*Última atualização: Arquitetura simplificada. Agente Único Groq (Analista e Programador). Chat à direita. Sistema de Implementação com um clique (// FILE: + botão Implementar + Diff/Review). Sem extensão Chrome nem AI Studio.*
