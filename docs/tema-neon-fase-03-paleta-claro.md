# Fase 3 — Paleta do Tema Claro

← [Voltar ao planejamento](./planejamento-tema-neon.md)

## Objetivo

Definir tokens para light mode (backgrounds, texto, accent) em tailwind e globals.css.

---

## Checklist de Ações

- [x] **3.1 Backgrounds light** — ds-bg-primary-light, ds-surface-light, ds-surface-elevated-light
- [x] **3.2 Texto light** — ds-text-primary-light, ds-text-secondary-light, ds-text-muted-light
- [x] **3.3 Accent light** — Verde escuro para contraste (ex: #00aa44)
- [x] **3.4 Bordas light** — ds-border-light
- [x] **3.5 Variáveis CSS** — Usar data-theme="light" ou :root.light para aplicar

---

## Detalhamento das Ações

| # | Token | Valor sugerido | Uso |
|---|-------|----------------|-----|
| 3.1 | ds-bg-primary-light | #f6f8fa | Fundo principal |
| 3.1 | ds-surface-light | #ffffff | Sidebar, chat |
| 3.1 | ds-surface-elevated-light | #f0f0f0 | Titlebar |
| 3.2 | ds-text-primary-light | #24292f | Texto principal |
| 3.2 | ds-text-secondary-light | #57606a | Texto secundário |
| 3.2 | ds-text-muted-light | #8b949e | Texto muted |
| 3.3 | ds-accent-light | #00aa44 | Accent (verde escuro) |
| 3.4 | ds-border-light | #d0d7de | Bordas |

---

## Entregáveis

- Tokens light em tailwind.config.ts (com variante ou prefixo)
- Variáveis em globals.css para :root:not(.dark) ou [data-theme="light"]
- Documentação em design-tokens.md
