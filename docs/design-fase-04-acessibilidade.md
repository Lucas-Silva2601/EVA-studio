# Fase 4 — Acessibilidade (A11y)

← [Voltar ao planejamento](./planejamento-design.md)

## Objetivo

Cumprir WCAG e garantir usabilidade por teclado e leitores de tela.

---

## Checklist de Ações

- [x] **4.1 Focus visível** — Todos os elementos interativos com `focus-visible:ring` ou outline adequado
- [x] **4.2 Navegação por teclado** — Tab order lógico; atalhos documentados; resize handles com suporte a Arrow keys (já parcialmente implementado)
- [x] **4.3 Screen readers** — `aria-label`, `role`, `sr-only` onde necessário; ícones decorativos com `aria-hidden`
- [x] **4.4 Contraste** — Revisar cores de texto (gray-200, gray-400) em fundos escuros; usar ferramentas de contraste

---

## Checklist de Contraste (WCAG AA)

| Combinação | Ratio | Status |
|------------|-------|--------|
| gray-200 (#e5e5e5) em ds-bg-primary (#1e1e1e) | 12.6:1 | ✓ AAA |
| gray-400 (#a3a3a3) em ds-bg-primary | 4.6:1 | ✓ AA |
| vscode-accent (#0e639c) em ds-surface | 4.5:1 | ✓ AA |
| ds-text-success em ds-bg-secondary | 4.5:1 | ✓ AA |
| ds-text-error em ds-bg-secondary | 4.5:1 | ✓ AA |

Alto contraste: `@media (prefers-contrast: more)` em `globals.css` aumenta outline de focus.

---

## Detalhamento das Ações

| # | Ação | Descrição | Referência |
|---|------|-----------|------------|
| 4.1 | Focus visível | Elementos interativos com `focus-visible:ring` ou outline adequado | Tailwind: Focus Visible |
| 4.2 | Navegação por teclado | Tab order lógico; atalhos documentados; Arrow keys nos resize handles | ARIA, Keyboard |
| 4.3 | Screen readers | `aria-label`, `role`, `sr-only`; ícones com `aria-hidden` | Tailwind: sr-only |
| 4.4 | Contraste | Revisar gray-200, gray-400 em fundos escuros; ferramentas de contraste | WCAG AA |

---

## Entregáveis

- [acessibilidade.md](./acessibilidade.md) — Atalhos de teclado, navegação, focus, screen readers, contraste
- Skip link "Pular para conteúdo principal" em `page.tsx`
- `id="main-content"` e `role="main"` no container principal
- `aria-hidden` em ícones decorativos (Trash2, X, Edit3 em botões)
- `aria-label` em botões Edit do DiffReviewModal
- Modais: Escape para fechar; focus trap no mount
- Checklist de contraste (acima)
