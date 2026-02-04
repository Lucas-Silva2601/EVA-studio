# Índice da documentação – EVA Studio

Documentação de melhorias do projeto EVA Studio, organizada em fases com checklists de ações. Cada arquivo corresponde a uma fase e contém itens verificáveis para **arquitetura**, **design**, **funcionalidade** e **limpeza** (pastas/arquivos/dependências desnecessárias).

## Objetivo

- Guiar evolução do projeto com base em melhores práticas (Next.js, React, acessibilidade).
- Identificar e remover código, pastas e dependências inúteis.
- Manter consistência entre documentação (README, comentários) e código.

## Fases

| Fase | Arquivo | Foco |
|------|---------|------|
| 1 | [01-fase-fundacao-e-limpeza.md](./01-fase-fundacao-e-limpeza.md) | Dependências, configuração, pastas/arquivos inúteis, documentação |
| 2 | [02-fase-arquitetura.md](./02-fase-arquitetura.md) | Estrutura do projeto, App Router, separação de responsabilidades, tipos |
| 3 | [03-fase-design.md](./03-fase-design.md) | UI/UX, acessibilidade, temas, componentes visuais |
| 4 | [04-fase-funcionalidade.md](./04-fase-funcionalidade.md) | Features, API, extensão Chrome, fluxos de uso |
| 5 | [05-fase-qualidade-e-manutencao.md](./05-fase-qualidade-e-manutencao.md) | Testes, lint, segurança, performance, documentação de código |

## Como usar

1. Abra o arquivo da fase desejada.
2. Siga os checklists na ordem sugerida (cima → baixo).
3. Marque com `[x]` os itens concluídos.
4. Use o `checklist.md` na raiz do repositório (se existir) para acompanhar entregas por sprint.

## Referências (Context7)

As recomendações foram alinhadas com a documentação oficial:

- **Next.js** (`/vercel/next.js`): App Router, Route Handlers, variáveis de ambiente, Server/Client Components, lazy loading com `next/dynamic`.
- **React**: componentes client vs server, hooks, estado.

---

*Última atualização: fevereiro 2025.*
