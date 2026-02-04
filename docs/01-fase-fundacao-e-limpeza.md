# Fase 1 – Fundação e limpeza

Checklist de ações para consolidar a base do projeto: dependências, configuração, remoção de arquivos/pastas inúteis e alinhamento da documentação.

---

## 1.1 Dependências

- [ ] **Revisar dependências de produção** em `package.json`: todas estão em uso (Next.js, React, Monaco, Mermaid, WebContainer, Lucide). Nenhuma remoção sugerida; manter apenas o necessário.
- [ ] **Revisar devDependencies**: TypeScript, ESLint, Tailwind, PostCSS, Autoprefixer, tipos `@types/*` estão em uso. Não adicionar pacotes sem necessidade.
- [ ] **Correção de vulnerabilidades**: rodar `npm audit` e, se possível, `npm audit fix` (evitar `--force` sem análise). Documentar exceções aceitas em `docs/` ou README.
- [ ] **Travar versões críticas** (opcional): para builds reproduzíveis, considerar `package-lock.json` sempre commitado e, se necessário, `npm ci` em CI.

---

## 1.2 Configuração

- [ ] **Remover referência a pasta inexistente no Tailwind**: em `tailwind.config.ts`, a propriedade `content` inclui `"./pages/**/*.{js,ts,jsx,tsx,mdx}"`. O projeto usa apenas **App Router** (`app/`); não existe pasta `pages/`. Remover a entrada `./pages/**` do array `content` para evitar confusão e escopo desnecessário.
- [ ] **Variáveis de ambiente**: garantir que `.env.example` documente todas as variáveis necessárias (ex.: `GROQ_API_KEY`). O código usa `.env`; padronizar com Next.js usando `.env.local` para valores locais (e documentar no README).
- [ ] **next.config.js**: headers de COOP/COEP estão corretos para WebContainers. Manter; documentar em README ou em `docs/` que são obrigatórios para execução no browser.

---

## 1.3 Pastas e arquivos inúteis

- [ ] **Não existe pasta `pages/`**: não criar; o projeto é 100% App Router. Apenas remover referência no Tailwind (ver 1.2).
- [ ] **Pasta `chrome-extension/`**: **manter** – faz parte do fluxo IDE ↔ Google AI Studio (Gemini). Não é inútil.
- [ ] **Arquivos na raiz**: `next-env.d.ts`, `tsconfig.json`, `postcss.config.js`, `next.config.js`, `.eslintrc.json`, `.gitignore` são necessários. Nenhum arquivo óbvio para descarte.
- [ ] **Verificar arquivos órfãos**: não há arquivos soltos em `lib/` ou `components/` sem uso; as importações estão coerentes com a árvore do projeto.

---

## 1.4 Documentação desatualizada

- [ ] **README.md – nome do script da extensão**: o README cita `chrome-extension/content-ai-studio.js` para atualização de seletores. O arquivo real é **`content-gemini.js`**. Corrigir para `content-gemini.js` no README (e, se existir, em `chrome-extension/README.md`).
- [ ] **README – variável de ambiente**: o README orienta criar `.env.local` para `GROQ_API_KEY`; o código em `app/api/groq/route.ts` usa `process.env.GROQ_API_KEY`. Confirmar se o exemplo mostra `.env.local` e se a documentação menciona que a chave não é exposta ao frontend.
- [ ] **.env.example**: conter apenas chaves sem valores (ex.: `GROQ_API_KEY=`). Garantir que está alinhado com o que a API Groq espera.

---

## 1.5 Resumo – itens descartáveis / ajustes

| Item | Ação |
|------|------|
| Pasta `pages/` | Não existe; remover do `content` do Tailwind. |
| Dependências não usadas | Nenhuma identificada; todas em uso. |
| `content-ai-studio.js` no README | Corrigir para `content-gemini.js`. |
| Tailwind `content` | Remover `./pages/**` do array. |

---

*Fase 1 concluída quando todos os itens acima estiverem revisados e, quando aplicável, implementados.*
