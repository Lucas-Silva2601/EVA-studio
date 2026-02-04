# Fase 2 — Tema e Modo Escuro

← [Voltar ao planejamento](./planejamento-design.md)

## Objetivo

Tema escuro robusto com suporte opcional a preferência do sistema.

---

## Checklist de Ações

- [x] **2.1 Dark mode estável** — Garantir que `class="dark"` no `<html>` seja aplicado corretamente; evitar FOUC (flash de conteúdo não estilizado)
- [x] **2.2 Preferência do sistema** — Implementar detecção `prefers-color-scheme: dark` com fallback em `localStorage`
- [x] **2.3 Variante `dark:`** — Usar `dark:` em Tailwind onde necessário para componentes que mudem entre modos (se futuramente houver light mode)
- [x] **2.4 Contraste** — Validar ratios de contraste (WCAG AA) para texto em fundos escuros; usar `contrast-more:` para usuários que preferem alto contraste

---

## Checklist de Contraste (WCAG AA)

| Elemento | Combinação | Ratio mínimo |
|----------|------------|--------------|
| Texto principal | gray-200 (#e5e5e5) em ds-bg-primary (#1e1e1e) | 12.6:1 ✓ |
| Texto secundário | gray-400 (#a3a3a3) em ds-bg-primary | 4.6:1 ✓ |
| Accent | vscode-accent (#0e639c) em ds-surface | 4.5:1 ✓ |
| Success | ds-text-success (#4ade80) em ds-bg-secondary | 4.5:1 ✓ |
| Error | ds-text-error (#f87171) em ds-bg-secondary | 4.5:1 ✓ |

Alto contraste: `@media (prefers-contrast: more)` em `globals.css` aumenta outline de focus.

---

## Detalhamento das Ações

| # | Ação | Descrição | Referência |
|---|------|-----------|------------|
| 2.1 | Dark mode estável | `class="dark"` no `<html>` aplicado corretamente; evitar FOUC | Tailwind: Dark mode |
| 2.2 | Preferência do sistema | Detecção `prefers-color-scheme: dark` com fallback em `localStorage` | Tailwind: Manage Dark Mode with localStorage |
| 2.3 | Variante `dark:` | Usar `dark:` em Tailwind para componentes que mudem entre modos | Tailwind: Dark Mode Variant |
| 2.4 | Contraste | Ratios WCAG AA; suporte `contrast-more:` para alto contraste | Tailwind: contrast-more modifier |

---

## Entregáveis

- Tema escuro consistente
- Opção de respeitar preferência do sistema (localStorage + prefers-color-scheme)
- Script anti-FOUC em `layout.tsx`
- `darkMode: "class"` em `tailwind.config.ts`
- Suporte `prefers-contrast: more` em `globals.css`
- Checklist de contraste (acima)
