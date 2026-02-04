# Fase 1 — Tokens e Paleta Neon

← [Voltar ao planejamento](./planejamento-tema-neon.md)

## Objetivo

Definir tokens de cores neon e glow em `tailwind.config.ts` e `globals.css`.

---

## Checklist de Ações

- [x] **1.1 Cores neon** — Adicionar `ds-accent-neon`, `ds-accent-neon-hover` em tailwind e globals.css
- [x] **1.2 Glow** — Definir variável `--ds-glow-neon` e classe utilitária para box-shadow
- [x] **1.3 Aliases** — Manter retrocompatibilidade com vscode-accent apontando para neon (ou variante)
- [x] **1.4 Documentar** — Atualizar design-tokens.md com paleta neon

---

## Detalhamento das Ações

| # | Ação | Descrição | Valor sugerido |
|---|------|-----------|----------------|
| 1.1 | Cores neon | ds-accent-neon, ds-accent-neon-hover | #39ff14, #5fff50 |
| 1.2 | Glow | --ds-glow-neon para box-shadow | 0 0 10px rgba(57,255,20,0.3) |
| 1.3 | Aliases | vscode-accent pode apontar para neon no dark | - |
| 1.4 | Documentar | design-tokens.md | Nova seção "Tema Neon" |

---

## Entregáveis

- Tokens neon em tailwind.config.ts e globals.css
- Classe .glow-neon ou variável --ds-glow-neon
- Documentação em design-tokens.md
