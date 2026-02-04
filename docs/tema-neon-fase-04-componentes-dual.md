# Fase 4 — Componentes Dual (dark:/light:)

← [Voltar ao planejamento](./planejamento-tema-neon.md)

## Objetivo

Refatorar componentes para suportar ambos os temas usando variantes `dark:` e default (light).

---

## Checklist de Ações

- [x] **4.1 Layout e body** — bg-white dark:bg-ds-bg-primary; text para ambos
- [x] **4.2 TitleBar** — Cores para light e dark
- [x] **4.3 Sidebar e ChatPanel** — Surface e bordas dual
- [x] **4.4 BottomPanel** — Output com cores dual
- [x] **4.5 EditorArea** — Abas e botões dual
- [x] **4.6 Modais** — DiffReviewModal, ArchitectureMapView, GenesisQueuePanel
- [x] **4.7 Chat e Output** — Mensagens, typeStyles dual

---

## Detalhamento das Ações

| # | Componente | Padrão (light) | Dark |
|---|------------|----------------|------|
| 4.1 | body, main | bg-ds-bg-primary-light text-ds-text-primary-light | dark:bg-ds-bg-primary dark:text-ds-text-primary |
| 4.2 | TitleBar | bg-ds-surface-elevated-light | dark:bg-ds-surface-elevated |
| 4.3 | Sidebar, Chat | bg-ds-surface-light border-ds-border-light | dark:bg-ds-surface dark:border-ds-border |
| 4.4 | BottomPanel | bg-ds-bg-secondary-light | dark:bg-ds-bg-secondary |
| 4.5 | EditorArea | Abas, botão Salvar | dark: variantes |
| 4.6 | Modais | Mesmo padrão | dark: variantes |
| 4.7 | Chat/Output | Cores de mensagem | dark: variantes |

---

## Entregáveis

- Componentes com classes dual (light default + dark:)
- Tema claro funcional ao remover class="dark" do html
- Consistência visual em ambos os temas
