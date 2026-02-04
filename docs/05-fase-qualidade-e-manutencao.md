# Fase 5 – Qualidade e manutenção

Checklist de ações para testes, lint, segurança, performance e documentação contínua.

---

## 5.1 Testes

- [ ] **Testes unitários**: atualmente não há suíte de testes. Considerar adicionar Jest (ou Vitest) + React Testing Library para funções puras em `lib/` (ex.: `sanitize.ts`, `evaActions.ts`, `checklistPhase.ts`, `markdownCodeParser`) e para hooks/componentes críticos.
- [ ] **Testes E2E**: considerar Playwright ou Cypress para fluxos principais (abrir pasta, abrir arquivo, salvar, executar loop com mock da API e da extensão). Documentar no README como rodar.
- [ ] **CI**: se houver GitHub Actions (ou outro CI), adicionar passo de `npm ci` e `npm run lint`; opcionalmente `npm run build` e, quando existirem, `npm test`.

---

## 5.2 Lint e formatação

- [ ] **ESLint**: projeto usa `eslint-config-next`. Rodar `npm run lint` regularmente e corrigir avisos. Manter regras sem desabilitar sem justificativa.
- [ ] **TypeScript**: garantir que `npm run build` conclua sem erros de tipo. Não usar `any` sem necessidade; tipar payloads da API e da extensão.
- [ ] **Formatação**: considerar Prettier com configuração consistente (indent, aspas) e, se possível, format on save ou pre-commit hook.

---

## 5.3 Segurança

- [ ] **API Key**: nunca expor `GROQ_API_KEY` no cliente; já está apenas em `app/api/groq/route.ts` via `process.env`. Revisar se alguma rota ou componente envia chave para o frontend.
- [ ] **Sanitização**: caminhos e conteúdo de arquivos vindos da extensão ou do Chat devem passar por `lib/sanitize.ts` antes de escrever em disco. Revisar todos os pontos de escrita (createFileWithContent, writeFileContent, proposta de diff).
- [ ] **Dependências**: rodar `npm audit` e tratar vulnerabilidades críticas/altas quando possível; documentar exceções aceitas.

---

## 5.4 Performance

- [ ] **Bundle**: Monaco e Mermaid são carregados dinamicamente; manter essa estratégia. Evitar import estático de bibliotecas pesadas no layout ou na página principal.
- [ ] **Re-renders**: useIdeState é um contexto grande; garantir que componentes que só precisam de um subconjunto do estado não re-renderizem desnecessariamente (considerar dividir contexto ou usar seletores).
- [ ] **Listas longas**: FileTree e lista de mensagens do Chat podem ter muitos itens; considerar virtualização se houver problemas de performance (ex.: react-window).

---

## 5.5 Documentação de código

- [ ] **JSDoc**: funções públicas em `lib/` (fileSystem, groq, runtime, messaging) têm comentários; manter e estender para parâmetros e retornos quando não óbvios.
- [ ] **README**: manter atualizado com requisitos (Node 18+), passos de instalação, configuração de `.env.local`, uso da extensão e referência ao nome correto do script (`content-gemini.js`). Incluir link para `docs/` se útil.
- [ ] **docs/**: os arquivos em `docs/` (fases 1–5) devem ser revisados quando houver mudanças estruturais (nova rota, nova lib, remoção de feature). Atualizar `00-INDICE.md` se forem criadas novas fases.

---

## 5.6 Manutenção contínua

- [ ] **Atualização de dependências**: revisar dependências major (Next.js, React, Monaco, Mermaid) com cuidado; testar após atualizar. Manter lockfile commitado.
- [ ] **Deprecações**: Next.js e React podem deprecar APIs; acompanhar changelog e avisos no build. Groq já migrou de modelo (llama3-70b para llama-3.3-70b); manter documentação de API atualizada.
- [ ] **Extensão Chrome**: se o Google AI Studio (Gemini) mudar a interface, atualizar seletores em `content-gemini.js` e documentar no README da extensão.

---

*Fase 5 concluída quando houver estratégia clara de testes e lint, segurança revisada e documentação alinhada ao código.*
