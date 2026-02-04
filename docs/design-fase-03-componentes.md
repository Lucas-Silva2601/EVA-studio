# Fase 3 — Componentes e Consistência Visual

← [Voltar ao planejamento](./planejamento-design.md)

## Objetivo

Componentes com visual uniforme e reutilizável.

---

## Checklist de Ações

- [x] **3.1 Botões** — Padronizar estados: default, hover, focus, disabled; usar `focus-visible:ring` em vez de apenas `focus:ring` para melhor acessibilidade
- [x] **3.2 Resize handles** — Unificar estilo das alças de redimensionamento (Sidebar, ChatPanel, BottomPanel); feedback visual claro no hover
- [x] **3.3 Scrollbars** — Manter `.scrollbar-thin` consistente em todos os painéis; garantir contraste adequado
- [x] **3.4 Inputs e formulários** — Estados focus, disabled, invalid; labels e mensagens de erro visíveis
- [x] **3.5 Bordas e separadores** — Usar tokens de borda (`vscode-border`) de forma consistente; evitar bordas hardcoded

---

## Detalhamento das Ações

| # | Ação | Descrição | Referência |
|---|------|-----------|------------|
| 3.1 | Botões | Estados default, hover, focus, disabled; `focus-visible:ring` | Tailwind: focus-visible |
| 3.2 | Resize handles | Unificar estilo em Sidebar, ChatPanel, BottomPanel; feedback no hover | globals.css atual |
| 3.3 | Scrollbars | `.scrollbar-thin` em todos os painéis; contraste adequado | globals.css |
| 3.4 | Inputs e formulários | Estados focus, disabled, invalid; labels e mensagens de erro | Tailwind: Form state modifiers |
| 3.5 | Bordas e separadores | Tokens `vscode-border` consistentes; evitar hardcode | — |

---

## Entregáveis

- Padrão visual documentado em [design-tokens.md](./design-tokens.md) (Padrões de Componentes)
- Refatoração de botões (focus-visible:ring em todos)
- Resize handles unificados (globals.css: .resize-handle-horizontal, .resize-handle-vertical)
- Scrollbars com variáveis CSS (--ds-scrollbar-*)
- Inputs/textareas com focus-visible, disabled, invalid
