# Fase 0 — Visão Geral do Planejamento

## Objetivo

Este documento serve como índice e visão geral do planejamento de melhorias do **EVA Studio**, alinhado ao guia de qualidade em `docs/prompt.md` e focado em **estabilizar e melhorar a extensão Chrome** (EVA Studio Bridge v3.0), que atualmente apresenta erros quando usada no navegador.

## Contexto

- **Projeto:** EVA Studio — IDE (Next.js) + extensão Chrome que faz ponte com o Google Gemini.
- **Problema:** A extensão aponta diversos erros no navegador; o projeto deve seguir as diretrizes de `prompt.md` (Clean Code, S.O.L.I.D., tipagem forte, fail fast, segurança).
- **Restrição:** Nenhuma mudança de código deve ser aplicada antes da aprovação do planejamento; cada fase é descrita em um arquivo `.md` separado na pasta `docs/`.

## Fases do Planejamento

| Fase | Arquivo | Foco |
|------|---------|------|
| **0** | `fase-00-visao-geral.md` | Índice e visão geral (este arquivo). |
| **1** | `fase-01-diagnostico-extensao.md` | Diagnóstico e estabilização da extensão — erros no console, sendResponse assíncrono, tratamento de erro no popup. |
| **2** | `fase-02-robustez-seguranca.md` | Robustez e segurança — validação de origem em postMessage, sanitização, boas práticas. |
| **3** | `fase-03-alinhamento-prompt.md` | Alinhamento ao prompt.md — código morto, tipagem, tamanho de arquivos, fail fast, nomenclatura. |
| **4** | `fase-04-manutenibilidade-extensao.md` | Manutenibilidade da extensão — modularização, documentação do protocolo, checklist de QA. |
| **5** | `fase-05-performance-ux.md` | Performance e UX — redução de polling, retry com backoff, mensagens de erro mais claras. |

## Ordem de Execução Recomendada

1. **Fase 1** — Resolver erros visíveis no navegador para ter uma base estável.
2. **Fase 2** — Reforçar segurança e robustez antes de escalar.
3. **Fase 3** — Aplicar diretrizes do `prompt.md` no codebase (IDE + extensão).
4. **Fase 4** — Organizar a extensão para facilitar futuras mudanças na UI do Gemini.
5. **Fase 5** — Refinos de performance e experiência do usuário.

## Próximos Passos

- Revisar e aprovar este planejamento.
- Implementar as tarefas de cada fase na ordem acima, marcando os critérios de conclusão em cada `fase-XX-*.md`.
