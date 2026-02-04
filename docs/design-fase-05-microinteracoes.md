# Fase 5 — Microinterações e Feedback

← [Voltar ao planejamento](./planejamento-design.md)

## Objetivo

Transições suaves e feedback visual para ações do usuário.

---

## Checklist de Ações

- [x] **5.1 Transições** — Transições curtas (150–200ms) para hover, focus, collapse/expand de painéis
- [x] **5.2 Estados de loading** — Indicadores claros para "Abrindo…", "Executando…", "Validando…"
- [x] **5.3 Feedback de ações** — Confirmação visual em ações críticas (salvar, enviar prompt, aplicar autocura)
- [x] **5.4 Redimensionamento** — Transição suave ao colapsar/expandir BottomPanel

---

## Detalhamento das Ações

| # | Ação | Descrição | Referência |
|---|------|-----------|------------|
| 5.1 | Transições | 150–200ms para hover, focus, collapse/expand | CSS transitions |
| 5.2 | Estados de loading | Indicadores para "Abrindo…", "Executando…", "Validando…" | UX patterns |
| 5.3 | Feedback de ações | Confirmação visual em salvar, enviar prompt, aplicar autocura | UX patterns |
| 5.4 | Redimensionamento | Transição suave no BottomPanel ao colapsar/expandir | CSS |

---

## Entregáveis

- **Transições** (`globals.css`): `button`, `a`, `[role="button"]` com transition 150ms; `.transition-panel` (height 200ms) no BottomPanel
- **Loading** (TitleBar): Loader2 com `animate-spin` em "Abrindo…" e "Executando…"; ChatSidebar/GenesisQueuePanel já tinham Loader2
- **Feedback Salvar** (EditorArea): Botão mostra "Salvo ✓" em verde por 1,5s após salvar (Ctrl+S ou clique)
- **BottomPanel**: `transition-panel` para animação suave ao colapsar/expandir
