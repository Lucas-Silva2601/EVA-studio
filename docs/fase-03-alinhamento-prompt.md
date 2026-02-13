# Fase 3 — Alinhamento ao prompt.md

## Objetivo

Aplicar as diretrizes técnicas e de qualidade definidas em `docs/prompt.md` ao codebase do EVA Studio (aplicação Next.js e extensão Chrome), priorizando manutenibilidade, performance e segurança.

## Escopo

- **Incluído:** Código da aplicação Next.js (app/, components/, lib/, hooks/, types/); código da extensão (chrome-extension/).  
- **Foco:** Limpeza de código morto, tipagem forte, limites de tamanho de arquivo, fail fast, tratamento de erros com contexto, nomenclatura e comentários.

## Diretrizes do prompt.md a Aplicar

- **S.O.L.I.D. & DRY:** Refatorar código repetido para funções auxiliares ou hooks.  
- **Limites de arquivo:** Arquivos > 250 linhas são code smell; sugerir divisão em módulos menores.  
- **Imutabilidade:** Preferir `const` e estruturas imutáveis; evitar side effects em funções puras.  
- **Tipagem forte:** Em TypeScript, evitar `any`; criar interfaces/types explícitos.  
- **Nomenclatura:** Inglês para código (variáveis, funções); português (PT-BR) para comentários explicativos.  
- **Variáveis:** Substantivos (`userData`, `isValid`); **Funções:** Verbos (`getUser`, `calculateTotal`).  
- **Auto-documentação:** Código claro; comentar apenas o “porquê”.  
- **Fail fast:** Validar inputs no topo da função.  
- **Tratamento de erros:** Não engolir erros; em try/catch, tratar ou propagar com contexto; logs com metadados úteis.  
- **Segurança:** Sem segredos no código; sanitizar inputs.

## Critérios de Conclusão

- [ ] Nenhum uso de `any` desnecessário nos arquivos TypeScript revisados (ou justificativa em comentário onde for inevitável).  
- [ ] Arquivos com mais de 250 linhas identificados e divididos ou documentado o plano de divisão (ex.: content-gemini.js, messaging.ts).  
- [ ] Código morto, importações não utilizadas e blocos comentados antigos removidos.  
- [ ] Funções que recebem input do usuário ou da extensão validam no topo (fail fast).  
- [ ] Catch blocks relevantes logam erro com contexto (ex.: tipo de mensagem, tabId), não apenas `console.error(err)`.

## Tarefas (Checklist)

1. **Inventário**  
   - [ ] Listar arquivos TypeScript/JavaScript do projeto com mais de 250 linhas (app, components, lib, hooks, chrome-extension).  
   - [ ] Listar ocorrências de `any` em tipos (tsconfig strict se aplicável).  
   - [ ] Identificar funções que processam payload da extensão ou input do usuário sem validação no início.

2. **Next.js (app, components, lib, hooks)**  
   - [ ] Remover importações não utilizadas e código morto (comentários de bloco antigos, funções não chamadas).  
   - [ ] Substituir `any` por tipos explícitos ou `unknown` com type guards; criar interfaces em types/ quando fizer sentido.  
   - [ ] Em lib/messaging.ts e pontos de entrada de postMessage: validar payload no topo e retornar cedo em caso inválido.  
   - [ ] Revisar catch blocks: adicionar log com contexto (ex.: “[messaging] waitForCodeFromExtension timeout”, “[api] preview sync error”, etc.).  
   - [ ] Dividir arquivos > 250 linhas (ex.: extrair helpers de messaging.ts para um módulo de normalização de arquivos; dividir componentes grandes em subcomponentes).

3. **Extensão Chrome**  
   - [ ] content-gemini.js: está em torno de 380 linhas — extrair seletores para um objeto/config; extrair funções de parsing e de extração de blocos para um segundo arquivo (ou manter em um único arquivo com seções bem definidas e documentar exceção ao limite de 250 linhas, se for decisão consciente).  
   - [ ] Remover comentários que apenas repetem o que o código faz; manter comentários que explicam “porquê” (ex.: regras de negócio para FILE:, debounce).  
   - [ ] Garantir que constantes sejam `const`; evitar reatribuições desnecessárias.  
   - [ ] Em content-ide e content-gemini, validar no topo dos handlers que `message.payload` e campos obrigatórios existem.

4. **Tipos (types/)**  
   - [ ] Revisar types/index.ts e global.d.ts; garantir que contratos da extensão (CodeResponsePayload, ErrorPayload, etc.) estejam alinhados com messaging.ts e com o que a extensão envia.  
   - [ ] Exportar tipos compartilhados entre IDE e documentação do protocolo (para referência na Fase 4).

5. **Documentação**  
   - [ ] Atualizar este documento com a lista de arquivos que permanecem > 250 linhas e a justificativa ou o link para o plano de divisão.

## Riscos e Dependências

- **Risco:** Dividir content-gemini em vários arquivos pode exigir ajuste no manifest (content_scripts.files) ou uso de bundler para a extensão.  
  **Mitigação:** Se não houver build step na extensão, considerar apenas organização interna (funções agrupadas) e comentários de seção; ou introduzir um build mínimo para a pasta chrome-extension.  
- **Dependência:** Fases 1 e 2 concluídas para não misturar refatoração grande com correções de erros e segurança.
