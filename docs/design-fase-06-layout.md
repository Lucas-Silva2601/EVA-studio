# Fase 6 — Layout e Densidade

← [Voltar ao planejamento](./planejamento-design.md)

## Objetivo

Layout responsivo e uso eficiente do espaço.

---

## Checklist de Ações

- [x] **6.1 Densidade** — Avaliar se padding/height dos painéis (TitleBar 2.5rem, botões) são adequados; opção de densidade compacta (futuro)
- [x] **6.2 Responsividade** — Comportamento em janelas estreitas; minimizar painéis lateral/inferior se necessário
- [x] **6.3 Hierarquia visual** — Títulos de seções (Explorador, Output, Chat) com hierarquia clara

---

## Variáveis de Layout (globals.css)

| Variável | Valor | Uso |
|----------|-------|-----|
| `--ds-titlebar-height` | 2.5rem | Altura da barra de título |
| `--ds-panel-header-height` | 2.5rem | Altura do cabeçalho dos painéis |
| `--ds-sidebar-min` | 140px | Largura mínima do Explorador |
| `--ds-chat-min` | 250px | Largura mínima do Chat |
| `--ds-editor-min` | 280px | Largura mínima da área do editor |

---

## Breakpoints e Responsividade

- **Largura mínima recomendada**: ~670px (Sidebar 140 + Editor 280 + Chat 250)
- **Área do editor**: `min-w-[280px]` no container central para legibilidade em janelas estreitas
- **Painéis laterais**: redimensionáveis; valores persistidos em localStorage

---

## Classe .panel-title

Títulos de painéis (Explorador, Output, Chat EVA) usam `.panel-title`:
- `text-xs` (12px), `font-semibold`, `uppercase`, `tracking-wider`
- Cor: gray-400 (consistência visual)

---

## Detalhamento das Ações

| # | Ação | Descrição | Referência |
|---|------|-----------|------------|
| 6.1 | Densidade | Avaliar padding/height; opção de densidade compacta (futuro) | VS Code, IDEs |
| 6.2 | Responsividade | Comportamento em janelas estreitas; painéis minimizáveis | Flexbox, min-width |
| 6.3 | Hierarquia visual | Títulos Explorador, Output, Chat com hierarquia clara | Tipografia |

---

## Entregáveis

- **Variáveis CSS** em `globals.css`: `--ds-titlebar-height`, `--ds-panel-header-height`, `--ds-sidebar-min`, `--ds-chat-min`, `--ds-editor-min`
- **Classe `.panel-title`**: hierarquia unificada para títulos de painéis
- **Responsividade**: `min-w-[280px]` no container do editor
- **ChatSidebar**: `text-gray-600` → `text-gray-400` para consistência no tema escuro
- Documentação de breakpoints e variáveis (acima)
