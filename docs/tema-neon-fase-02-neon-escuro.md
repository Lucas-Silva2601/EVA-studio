# Fase 2 — Aplicar Neon no Tema Escuro

← [Voltar ao planejamento](./planejamento-tema-neon.md)

## Objetivo

Substituir o accent azul por verde neon nos componentes principais.

---

## Checklist de Ações

- [x] **2.1 Accent principal** — Usar ds-accent-neon em botões primários (Executar, Implementar, Salvar)
- [x] **2.2 Focus ring** — focus-visible:ring com cor neon
- [x] **2.3 Resize handles** — Hover com accent neon
- [x] **2.4 Títulos de painéis** — Explorador, Output, Chat com cor neon ou borda sutil
- [x] **2.5 Scrollbars** — Thumb no hover com cor neon (opcional)
- [x] **2.6 Glow em destaque** — Botões primários com glow sutil (opcional)

---

## Detalhamento das Ações

| # | Ação | Componentes afetados | Classes |
|---|------|---------------------|---------|
| 2.1 | Accent principal | TitleBar, ChatSidebar, GenesisQueuePanel | bg-ds-accent-neon, hover:bg-ds-accent-neon-hover |
| 2.2 | Focus ring | Todos os botões, inputs, links | focus-visible:ring-ds-accent-neon |
| 2.3 | Resize handles | globals.css .resize-handle-horizontal/vertical | hover: accent neon |
| 2.4 | Títulos painéis | Sidebar, BottomPanel, ChatSidebar | .panel-title com cor neon |
| 2.5 | Scrollbars | globals.css --ds-scrollbar-thumb-hover | Cor neon no hover |
| 2.6 | Glow | Botões primários | shadow-[var(--ds-glow-neon)] |

---

## Entregáveis

- Componentes usando ds-accent-neon em vez de vscode-accent
- Resize handles e scrollbars com accent neon
- Visual neon consistente no tema escuro
