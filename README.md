# EVA Studio

**IDE autônoma na web** com dois agentes de IA: **Analista (Groq)** orquestra o progresso a partir de um checklist; **Programador (Google Gemini)** gera o código. A IDE salva arquivos localmente na pasta do usuário e mantém o fluxo automatizado.

---

## Visão geral

O EVA Studio é uma IDE baseada em navegador (React/Next.js) inspirada no VS Code, com editor Monaco, explorador de arquivos, painel de chat e execução de código (WebContainers). Um **loop de automação** conecta a IDE ao **Google Gemini** por meio de uma extensão Chrome: o Analista lê o `checklist.md`, gera o prompt da próxima tarefa e envia ao Gemini; a extensão injeta o prompt no Gemini e devolve o código à IDE; a IDE salva o arquivo e o Analista atualiza o checklist.

### Principais recursos

- **IDE na web**: editor Monaco, explorador de arquivos, painel Output, chat integrado
- **Dois agentes**: Analista (Groq, via API) e Programador (Gemini, via extensão Chrome)
- **Armazenamento local**: File System Access API para ler e escrever na pasta do projeto
- **Execução no navegador**: WebContainers para rodar Node/npm no painel Output
- **Tema dual**: modo claro e escuro (neon) com toggle e persistência em `localStorage`
- **Acessibilidade**: atalhos de teclado, foco visível, documentação em `docs/acessibilidade.md`

---

## Stack técnico

| Camada        | Tecnologia |
|---------------|------------|
| Frontend      | Next.js 14 (App Router), React 18, TypeScript |
| Estilo        | Tailwind CSS, design tokens (ver `docs/design-tokens.md`) |
| Editor        | Monaco Editor (@monaco-editor/react) |
| Runtime       | @webcontainer/api (execução no navegador) |
| Analista      | Groq (rotas `/api/groq`) |
| Programador   | Google Gemini (gemini.google.com) via extensão Chrome |

---

## Pré-requisitos

- **Node.js** 18+
- **npm** (ou yarn)
- **Chrome** (para a extensão e File System Access API em contexto seguro)

---

## Instalação e execução

### 1. Clonar e instalar dependências

```bash
git clone <url-do-repositorio>
cd EVA-studio
npm install
```

### 2. Configurar a API Groq (obrigatório para o loop)

1. Crie uma conta em [Groq Cloud](https://console.groq.com) e gere uma **API Key**.
2. Na raiz do projeto, crie o arquivo `.env.local` (não versionado):

   ```
   GROQ_API_KEY=sua_chave_aqui
   ```

A chave é usada **apenas no servidor** (rotas `/api/groq`) e nunca é exposta no frontend.

### 3. Subir a IDE

```bash
npm run dev
```

Acesse **http://localhost:3000**. A File System Access API exige contexto seguro (localhost ou HTTPS).

### 4. Instalar a extensão Chrome (necessário para o loop com Gemini)

1. Abra **chrome://extensions**.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta **`chrome-extension`** deste repositório.
4. Mantenha uma aba aberta em **https://gemini.google.com** ao usar **Executar Fase** / **Executar loop**.

Detalhes da extensão (protocolo, permissões, troubleshooting): [chrome-extension/README.md](chrome-extension/README.md).

### Headers COOP/COEP

O `next.config.js` define `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp`, necessários para WebContainers (SharedArrayBuffer). Não remova esses headers ou a opção **Executar** do arquivo atual pode falhar.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│  IDE (Next.js – localhost:3000)                                 │
│  • Monaco Editor, explorador de arquivos, painel Output, Chat   │
│  • File System Access API (ler/escrever pasta local)            │
│  • Rotas /api/groq → Analista (Groq)                            │
│  • postMessage ↔ Extensão Chrome                                │
└─────────────────────────────────────────────────────────────────┘
         │                                    ▲
         │ SEND_PROMPT                         │ CODE_RESPONSE / ERROR
         ▼                                    │
┌─────────────────────────────────────────────────────────────────┐
│  Extensão Chrome (EVA Studio Bridge)                             │
│  • Background: encaminha mensagens entre abas                    │
│  • Content script IDE: postMessage ↔ Background                 │
│  • Content script Gemini: injeta prompt, extrai código           │
└─────────────────────────────────────────────────────────────────┘
         │                                    ▲
         │ injeta prompt / submit              │ pre/code da resposta
         ▼                                    │
┌─────────────────────────────────────────────────────────────────┐
│  Google Gemini (gemini.google.com) – Agente Programador          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Uso do loop de automação

1. Na IDE, clique em **Abrir pasta** e escolha a pasta do seu projeto (deve conter um `checklist.md`).
2. Abra o **Google Gemini** em outra aba: **https://gemini.google.com**.
3. Na IDE, use **Executar Fase** (Groq) ou **+Gemini** (Executar Fase com Gemini). A IDE irá:
   - Analisar o `checklist.md` com o Groq e obter a próxima tarefa pendente.
   - Gerar um prompt para o Gemini e enviá-lo à extensão.
   - A extensão injetar o prompt no Gemini e aguardar o código gerado.
   - A IDE salvar o arquivo na pasta local e o Analista validar e atualizar o checklist (marcar `[x]` se aprovado).

Se a extensão indicar que o content script não está disponível na aba do Gemini, **recarregue a aba do Gemini (F5)** e tente novamente.

---

## Formato do `checklist.md`

O arquivo **`checklist.md`** na raiz da pasta aberta controla o progresso do projeto. O Analista (Groq) lê esse arquivo e identifica a próxima linha com tarefa pendente (`[ ]`).

| Estado     | Sintaxe |
|------------|---------|
| Pendente   | `- [ ] Descrição da tarefa` |
| Concluído  | `- [x] Descrição da tarefa` |

Exemplo:

```markdown
# Checklist – Meu Projeto

- [x] Configurar projeto Next.js
- [ ] Criar componente de Login em components/Login.tsx
- [ ] Adicionar rota /dashboard
```

Se não existir `checklist.md`, a IDE pode criar um arquivo inicial ao abrir a pasta.

---

## Estrutura do projeto

```
EVA-studio/
├── app/                    # Next.js App Router (layout, page, api, globals.css, icon)
├── components/             # Layout (Sidebar, TitleBar, EditorArea, ChatPanel, etc.)
├── hooks/                  # useIdeState, useResize, useTheme
├── lib/                     # fileSystem, groq, messaging, sanitize, runtime, etc.
├── types/                   # Tipos TypeScript globais
├── docs/                    # Documentação (design-tokens, acessibilidade)
├── chrome-extension/        # Extensão Chrome (manifest, background, content scripts)
├── next.config.js
├── tailwind.config.ts
├── .env.example             # Exemplo de variáveis (GROQ_API_KEY)
└── .env.local               # Sua chave Groq (não versionado)
```

---

## Segurança e boas práticas

- **API Key Groq**: usada somente nas rotas de API do Next.js (`app/api/groq/route.ts`); nunca é enviada ao navegador.
- **postMessage**: a IDE valida a origem das mensagens da extensão (`event.origin === window.location.origin`).
- **Dados da extensão**: caminhos e conteúdo são sanitizados antes de escrever em disco (evita path traversal e arquivos excessivamente grandes). Ver `lib/sanitize.ts`.
- **Extensão**: permissões limitadas a `tabs`, `scripting`, `storage` e hosts da IDE e do Gemini. Ver [chrome-extension/README.md](chrome-extension/README.md).

---

## Testes

- **Testes unitários**: `npm run test` (Vitest). Ex.: `lib/sanitize.test.ts`.
- **Lint**: `npm run lint` (ESLint + Next.js).
- **Formatação**: `npm run format` (Prettier).

Para validar o fluxo completo: rode a IDE em localhost, abra uma pasta com `checklist.md`, tenha a extensão instalada e o Gemini aberto; use **Executar Fase** e acompanhe o painel Output. Se a interface do Gemini mudar, os seletores em `chrome-extension/content-gemini.js` podem precisar ser atualizados (ver [chrome-extension/README.md](chrome-extension/README.md)).

---

## Documentação

| Documento | Descrição |
|-----------|-----------|
| [chrome-extension/README.md](chrome-extension/README.md) | Instalação, protocolo de mensagens e robustez da extensão |
| [docs/design-tokens.md](docs/design-tokens.md) | Tokens de design (cores, tema neon, tema claro) |
| [docs/acessibilidade.md](docs/acessibilidade.md) | Atalhos de teclado, navegação e tema claro/escuro |

---

## Licença

Projeto de uso livre para fins educacionais e desenvolvimento local.
