# Exceções de vulnerabilidades (npm audit) – Fase 1

Este documento registra o resultado de `npm audit` e as exceções aceitas (vulnerabilidades que não são corrigidas de imediato para evitar breaking changes).

## Última execução

- **Data**: fevereiro 2025 (Fase 1).
- **Comando**: `npm audit`.

## Resumo do relatório

- **Total**: 11 vulnerabilidades (7 moderate, 3 high, 1 critical).
- **Origens**:
  - **glob** (high): dependência transitiva de `eslint-config-next`. Correção sugerida: `npm audit fix --force`, que instala `eslint-config-next@16.x` (breaking change).
  - **lodash-es** (moderate): dependência transitiva de **mermaid** (via chevrotain/langium). Correção sugerida: `npm audit fix --force`, que faz downgrade do mermaid (breaking change).
  - **next** (critical/moderate): várias CVEs no Next.js. Correção sugerida: `npm audit fix` (pode atualizar Next.js dentro do major).

## Exceções aceitas

| Pacote / origem | Severidade | Motivo da exceção |
|-----------------|------------|-------------------|
| glob (via eslint-config-next) | high | Corrigir exige `--force` e atualização para eslint-config-next@16.x; pode incompatibilizar com Next.js 14. Aceito até planejamento de upgrade. |
| lodash-es (via mermaid) | moderate | Corrigir exige `--force` e downgrade do mermaid; impacto em funcionalidade (mapa Mermaid). Aceito como dependência transitiva. |
| next (várias CVEs) | critical/moderate | Executar `npm audit fix` (sem `--force`) quando possível para atualizar Next.js; revisar changelog antes. |

## Ações recomendadas

- [ ] Periodicamente rodar `npm audit` e revisar este documento.
- [ ] Ao planejar upgrade de Next.js (ex.: 14 → 15), reassessar `npm audit fix` e `npm audit fix --force` para glob/eslint.
- [ ] Acompanhar atualizações do **mermaid** que resolvam a dependência lodash-es.

---

*Documento criado na Fase 1 – Fundação e limpeza.*
