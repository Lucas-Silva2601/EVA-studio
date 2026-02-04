# Design Tokens — EVA Studio

Documentação dos tokens de design utilizados na IDE EVA Studio. Os tokens garantem consistência visual e facilitam manutenção.

---

## Cores Semânticas

| Token | Valor | Uso |
|-------|-------|-----|
| `ds-bg-primary` | `#1e1e1e` | Fundo principal (editor, área central) |
| `ds-bg-secondary` | `#181818` | Fundo secundário (painel Output) |
| `ds-surface` | `#252526` | Superfície (sidebar, chat) |
| `ds-surface-hover` | `#2a2d2e` | Hover em superfície |
| `ds-surface-elevated` | `#323233` | Superfície elevada (titlebar) |
| `ds-border` | `#3c3c3c` | Bordas e separadores |
| `ds-accent` | `#0e639c` | Cor de destaque (links, focus, ações) |
| `ds-accent-hover` | `#1177bb` | Hover em elementos accent |

### Texto

| Token | Valor | Uso |
|-------|-------|-----|
| `ds-text-primary` | `#e5e5e5` (gray-200) | Texto principal |
| `ds-text-secondary` | `#a3a3a3` (gray-400) | Texto secundário |
| `ds-text-muted` | `#737373` (gray-500) | Texto desabilitado/muted |

### Estados (Output, Chat, feedback)

| Token | Valor | Uso |
|-------|-------|-----|
| `ds-text-info` | `#d1d5db` | Mensagens informativas |
| `ds-text-success` | `#4ade80` | Sucesso (verde) |
| `ds-text-warning` | `#facc15` | Avisos (amarelo) |
| `ds-text-error` | `#f87171` | Erros (vermelho) |

---

## Escala de Espaçamento

Base: **4px**. Usar classes Tailwind (`p-*`, `m-*`, `gap-*`) em vez de valores arbitrários.

| Classe | Valor | Uso |
|--------|-------|-----|
| `1` | 4px | Espaçamento mínimo |
| `2` | 8px | Padding compacto |
| `3` | 12px | Padding padrão |
| `4` | 16px | Padding confortável |
| `5` | 20px | Espaço entre seções |
| `6` | 24px | Separação maior |

---

## Tipografia

### Font Stack

| Contexto | Fontes | Uso |
|----------|--------|-----|
| UI (sans) | `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif | Interface geral |
| Código (mono) | `ui-monospace`, `SFMono-Regular`, `Consolas`, monospace | Editor, Output, blocos de código |

### Tamanhos

| Classe | Tamanho | Uso |
|--------|---------|-----|
| `text-xs` | 12px | Labels, badges, títulos de painel |
| `text-sm` | 14px | Texto padrão da UI |
| `text-base` | 16px | Texto maior, títulos |

### Pesos

| Classe | Peso | Uso |
|--------|------|-----|
| `font-normal` | 400 | Texto corpo |
| `font-medium` | 500 | Ênfase leve |
| `font-semibold` | 600 | Títulos, labels |

---

## Tema e Modo Escuro

- **darkMode**: `class` (Tailwind). O script em `layout.tsx` aplica `class="dark"` no `<html>` antes do primeiro paint.
- **Preferência**: `localStorage.theme` ('dark' | 'light') ou `prefers-color-scheme` do sistema.
- **Futuro light mode**: Usar variante `dark:` em componentes (ex: `bg-white dark:bg-ds-bg-primary`).

---

## Uso no Tailwind

```tsx
// Cores semânticas
className="bg-ds-bg-primary text-ds-text-primary border-ds-border"

// vscode-* mantidos para retrocompatibilidade (aliases)
className="bg-vscode-sidebar" // equivalente a ds-surface
```

---

## Padrões de Componentes (Fase 3)

### Botões
- Estados: `hover:bg-vscode-sidebar-hover`, `focus-visible:ring-1 focus-visible:ring-vscode-accent`, `disabled:opacity-50 disabled:cursor-not-allowed`
- Usar `focus-visible:ring` (não `focus:ring`) para acessibilidade

### Resize Handles
- Classes: `.resize-handle-horizontal` (col-resize) ou `.resize-handle-vertical` (row-resize)
- Inner span: `.resize-handle-inner`
- Estilo unificado em `globals.css` (ds-border, ds-accent no hover)

### Scrollbars
- Classe: `.scrollbar-thin` em painéis com overflow
- Variáveis: `--ds-scrollbar-track`, `--ds-scrollbar-thumb`, `--ds-scrollbar-thumb-hover`

### Inputs e Textareas
- Focus: `focus-visible:ring-1 focus-visible:ring-vscode-accent`
- Disabled: `disabled:opacity-50 disabled:cursor-not-allowed`
- Invalid: `invalid:border-red-500`
- Bordas: `border-vscode-border`

### Bordas
- Usar `border-vscode-border` (token) em vez de cores hardcoded
- Bordas semânticas (alerts): `border-amber-600/50`, `border-green-600/40` permitidas

### Títulos de Painéis (Fase 6)
- Classe: `.panel-title` (globals.css)
- Padrão: text-xs, font-semibold, uppercase, tracking-wider, gray-400
- Usar em Explorador, Output, Chat EVA

---

## Variáveis CSS (`:root`)

As variáveis em `globals.css` expõem os tokens para uso em CSS puro e componentes que precisam de `var()`:

```css
--ds-bg-primary
--ds-surface
--ds-border
--ds-accent
--ds-text-primary
--ds-text-secondary
--ds-text-muted
/* etc. */
```
