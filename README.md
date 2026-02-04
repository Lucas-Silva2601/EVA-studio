# EVA Studio

IDE baseada na web que funciona de forma autônoma, utilizando um sistema de dois agentes de IA (**Analista** e **Programador**) para desenvolver projetos salvos localmente no computador do usuário.

## Objetivo

- **IDE (Frontend)**: aplicação React/Next.js com editor de código Monaco, inspirada no VS Code.
- **Agente Analista (Groq)**: integrado na IDE via API para gerenciar o progresso (ler checklist, gerar prompt, validar arquivos).
- **Ponte de Comunicação (Extensão Chrome)**: conecta a IDE à aba do Google AI Studio (Agente Programador), injetando prompts e capturando o código gerado.

O fluxo automático: o Analista lê o `checklist.md`, identifica a próxima tarefa pendente, gera um prompt e envia à extensão; a extensão injeta o prompt no Google AI Studio e devolve o código à IDE; a IDE salva o arquivo localmente e o Analista valida e atualiza o checklist.

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│  IDE (Next.js – localhost:3000)                                  │
│  • Monaco Editor, explorador de arquivos, painel Output           │
│  • File System Access API (ler/escrever pasta local)              │
│  • Chamadas à API Groq (rotas Next.js) para o Analista            │
│  • postMessage ↔ Extensão Chrome                                 │
└─────────────────────────────────────────────────────────────────┘
         │                                    ▲
         │ SEND_PROMPT                         │ CODE_RESPONSE / ERROR
         ▼                                    │
┌─────────────────────────────────────────────────────────────────┐
│  Extensão Chrome (EVA Studio Bridge)                             │
│  • Background: encaminha mensagens entre abas                     │
│  • Content script IDE: postMessage ↔ Background                  │
│  • Content script AI Studio: injeta prompt, extrai código        │
└─────────────────────────────────────────────────────────────────┘
         │                                    ▲
         │ injeta prompt / submit              │ pre/code da resposta
         ▼                                    │
┌─────────────────────────────────────────────────────────────────┐
│  Google AI Studio (aistudio.google.com) – Agente Programador     │
└─────────────────────────────────────────────────────────────────┘
```

## Como rodar a IDE

1. **Requisitos**: Node.js 18+ e npm (ou yarn).

2. **Instalar dependências**:
   ```bash
   npm install
   ```

3. **Configurar a API Groq** (obrigatório para o loop):
   - Crie uma conta em [Groq Cloud](https://console.groq.com) e gere uma API Key.
   - Na raiz do projeto, crie o arquivo `.env.local` (não versionado):
     ```
     GROQ_API_KEY=sua_chave_aqui
     ```
   - A chave é usada **apenas no servidor** (rotas `/api/groq`); nunca é exposta no frontend.

4. **Subir a IDE**:
   ```bash
   npm run dev
   ```
   Acesse **http://localhost:3000**. A File System Access API só funciona em contexto seguro (localhost ou HTTPS).

   **Headers COOP/COEP**: o `next.config.js` define os headers `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp`. Eles são **obrigatórios** para a execução de código no browser (WebContainers/SharedArrayBuffer). Não remova esses headers ou a opção "Executar" do arquivo atual pode falhar.

5. **Carregar a extensão Chrome** (necessário para o loop com o AI Studio):
   - Abra `chrome://extensions`.
   - Ative **Modo do desenvolvedor**.
   - Clique em **Carregar sem compactação** e selecione a pasta **`chrome-extension`** deste repositório.
   - Mantenha uma aba aberta com **https://aistudio.google.com** ao usar **Executar loop**.

## Uso do loop de automação

1. Na IDE, clique em **Abrir pasta** e escolha a pasta do seu projeto (deve conter um `checklist.md`).
2. Abra o **Google AI Studio** em outra aba e deixe-a aberta.
3. Na IDE, clique em **Executar loop**. A IDE irá:
   - Analisar o `checklist.md` com o Groq e obter a próxima tarefa pendente.
   - Gerar um prompt para o AI Studio e enviá-lo à extensão.
   - A extensão injeta o prompt no AI Studio e aguarda o código gerado.
   - A IDE salva o arquivo na pasta local e o Analista valida e atualiza o checklist (marca `[x]` se aprovado).

## Formato do `checklist.md`

O arquivo **`checklist.md`** na raiz da pasta aberta é o controle do projeto. O Analista (Groq) lê esse arquivo e identifica a próxima linha com tarefa pendente (`[ ]`).

- **Pendente**: `- [ ] Descrição da tarefa`
- **Concluído**: `- [x] Descrição da tarefa`

Exemplo:

```markdown
# Checklist – Meu Projeto

- [x] Configurar projeto Next.js
- [ ] Criar componente de Login em components/Login.tsx
- [ ] Adicionar rota /dashboard
```

Se não existir `checklist.md`, a IDE cria um arquivo inicial ao abrir a pasta.

## Estrutura do projeto

```
EVA-studio/
├── checklist.md           # Controle do projeto (este repositório)
├── README.md              # Este arquivo
├── docs/                  # Documentação de melhorias em fases (checklists)
├── .env.example           # Exemplo de variáveis (GROQ_API_KEY)
├── .env.local             # Sua chave Groq (não versionado)
├── app/
│   ├── api/groq/          # Rota API do Analista (Groq)
│   ├── layout.tsx, page.tsx, globals.css
├── components/            # Layout, explorador, editor, painel
├── lib/                   # fileSystem, groq, messaging, sanitize, utils
├── hooks/                 # useIdeState, useResize
├── types/
└── chrome-extension/      # Extensão Chrome (manifest, background, content scripts)
```

## Segurança e boas práticas

- **API Key Groq**: usada somente nas rotas de API do Next.js (`app/api/groq/route.ts`); nunca é enviada ao navegador.
- **Vulnerabilidades (npm audit)**: exceções aceitas e ações recomendadas estão documentadas em `docs/01-audit-exceptions.md`.
- **postMessage**: a IDE valida a origem das mensagens da extensão (`event.origin === window.location.origin`).
- **Dados da extensão**: caminhos de arquivo e conteúdo são sanitizados antes de escrever em disco (evita path traversal e arquivos excessivamente grandes). Ver `lib/sanitize.ts`.
- **Extensão**: permissões limitadas a `tabs`, `scripting`, `storage` e hosts da IDE e do AI Studio. Ver `chrome-extension/README.md`.

## Testes e robustez

- **Fluxo completo**: rode a IDE em localhost, abra uma pasta com `checklist.md`, tenha a extensão instalada e o AI Studio aberto; use **Executar loop** e acompanhe o Output.
- **Checklist real**: teste com múltiplas tarefas e tipos de arquivo (React, Python, etc.).
- **Extensão e AI Studio**: se a interface do Google AI Studio mudar, os seletores em `chrome-extension/content-gemini.js` podem precisar ser atualizados (instruções no próprio arquivo e em `chrome-extension/README.md`).
- **Aba do AI Studio fechada**: se o usuário fechar a aba do AI Studio durante o loop, a extensão envia um erro à IDE para que o estado não fique apenas em timeout.

## Licença

Projeto de uso livre para fins educacionais e desenvolvimento local.
