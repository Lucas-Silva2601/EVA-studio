# Fase 1 — Sistema de Design e Tokens

← [Voltar ao planejamento](./planejamento-design.md)

## Objetivo

Estabelecer um sistema de design coeso com tokens reutilizáveis.

---

## Checklist de Ações

- [x] **1.1 Design Tokens** — Centralizar cores, espaçamentos, bordas e tipografia em `tailwind.config.ts` e `globals.css` como variáveis CSS (`:root`) e classes utilitárias Tailwind
- [x] **1.2 Escala de cores semânticas** — Definir cores para: background, surface, border, text (primary, secondary, muted), accent, estados (success, warning, error, info)
- [x] **1.3 Escala de espaçamento** — Usar escala consistente (4px base) para padding/margin em componentes
- [x] **1.4 Tipografia** — Font stack mono para editor/código e sans para UI; tamanhos e pesos padronizados

---

## Detalhamento das Ações

| # | Ação | Descrição | Referência |
|---|------|-----------|------------|
| 1.1 | Design Tokens | Centralizar em `tailwind.config.ts` e `globals.css` como variáveis CSS (`:root`) e classes utilitárias Tailwind | Tailwind: Customize theme, Radix: Color tokens |
| 1.2 | Escala de cores semânticas | background, surface, border, text (primary, secondary, muted), accent, estados (success, warning, error, info) | Radix Themes: Gray/Accent tokens |
| 1.3 | Escala de espaçamento | Escala consistente com base 4px para padding/margin | Tailwind spacing scale |
| 1.4 | Tipografia | Mono para editor/código, sans para UI; tamanhos e pesos padronizados | VS Code, Radix |

---

## Entregáveis

- Arquivo de design tokens documentado
- Atualização de `tailwind.config.ts` e `globals.css`
