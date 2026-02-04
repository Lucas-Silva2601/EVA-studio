# Planejamento de Melhorias de Design — EVA Studio

> **Objetivo**: Melhorar a experiência visual, consistência e acessibilidade da IDE EVA Studio, alinhado às diretrizes do [prompt.md](./prompt.md) e às melhores práticas de design para interfaces tipo IDE.

---

## Contexto do Projeto

A EVA Studio é uma IDE web inspirada no VS Code, com:
- **Layout**: TitleBar | Sidebar (Explorador) | Editor central + Output (embaixo) | Chat EVA (direita)
- **Stack**: Next.js, Tailwind CSS, Monaco Editor, Lucide Icons
- **Tema atual**: Escuro, paleta inspirada no VS Code (variáveis CSS customizadas)

---

## Fases (Arquivos Detalhados)

Cada fase possui um arquivo próprio com **objetivo**, **checklist de ações** e **entregáveis**:

| # | Fase | Arquivo | Objetivo |
|---|------|---------|----------|
| 1 | Sistema de Design e Tokens | [design-fase-01-sistema-design.md](./design-fase-01-sistema-design.md) | Estabelecer um sistema de design coeso com tokens reutilizáveis |
| 2 | Tema e Modo Escuro | [design-fase-02-tema-modo-escuro.md](./design-fase-02-tema-modo-escuro.md) | Tema escuro robusto com suporte opcional a preferência do sistema |
| 3 | Componentes e Consistência Visual | [design-fase-03-componentes.md](./design-fase-03-componentes.md) | Componentes com visual uniforme e reutilizável |
| 4 | Acessibilidade (A11y) | [design-fase-04-acessibilidade.md](./design-fase-04-acessibilidade.md) | Cumprir WCAG e garantir usabilidade por teclado e leitores de tela |
| 5 | Microinterações e Feedback | [design-fase-05-microinteracoes.md](./design-fase-05-microinteracoes.md) | Transições suaves e feedback visual para ações do usuário |
| 6 | Layout e Densidade | [design-fase-06-layout.md](./design-fase-06-layout.md) | Layout responsivo e uso eficiente do espaço |
| 7 | Chat e Output | [design-fase-07-chat-output.md](./design-fase-07-chat-output.md) | Melhorar legibilidade e hierarquia do Chat e do painel Output |

---

## Priorização Sugerida

| Ordem | Fase | Motivo |
|-------|------|--------|
| 1 | [Fase 1 — Sistema de Design](./design-fase-01-sistema-design.md) | Base para todas as outras fases |
| 2 | [Fase 3 — Componentes](./design-fase-03-componentes.md) | Consistência imediata |
| 3 | [Fase 4 — Acessibilidade](./design-fase-04-acessibilidade.md) | Requisito do prompt (segurança e qualidade) |
| 4 | [Fase 2 — Tema](./design-fase-02-tema-modo-escuro.md) | Melhora contraste e experiência |
| 5 | [Fase 5 — Microinterações](./design-fase-05-microinteracoes.md) | Polimento |
| 6 | [Fase 6 — Layout](./design-fase-06-layout.md) | Otimização de espaço |
| 7 | [Fase 7 — Chat e Output](./design-fase-07-chat-output.md) | Foco em áreas de uso intenso |

---

## Referências Técnicas (Context7)

- **Tailwind CSS** (`/websites/v3_tailwindcss`): Dark mode, customização de tema, focus-visible, contrast-more, sr-only, form states
- **Radix Themes** (`/websites/radix-ui_themes`): Design tokens, dark mode com next-themes, high contrast, color tokens (accent, gray)
- **Radix UI** (`/radix-ui/website`): Componentes acessíveis, padrões de design system

---

## Alinhamento com prompt.md

Conforme [prompt.md](./prompt.md):

- **Manutenibilidade**: Sistema de design facilita evolução consistente.
- **Segurança**: Sanitização de inputs já existe; design não introduz vetores novos.
- **Qualidade**: Acessibilidade e tipagem forte (interfaces de design tokens em TS).
- **Limpeza**: Remoção de estilos hardcoded e duplicados em favor de tokens.
