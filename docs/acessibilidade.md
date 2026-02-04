# Acessibilidade (A11y) — EVA Studio

Documentação de acessibilidade da IDE EVA Studio, alinhada às diretrizes WCAG 2.1.

---

## Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| **Tab** | Navegar entre elementos focáveis |
| **Shift + Tab** | Navegar para trás |
| **Enter** ou **Space** | Ativar botão focado; expandir/colapsar painel Output |
| **Escape** | Fechar modal (Mapa do Projeto, Revisão de Diff) |
| **Ctrl + S** | Salvar arquivo atual no editor |
| **Arrow keys** | Redimensionar painéis (em resize handles focados): ← → no Explorador e Chat; ↑ ↓ no Output |

### Tema claro/escuro
- Botão na **TitleBar** (ícone Sol/Lua) alterna entre tema claro e escuro.
- Preferência persistida em `localStorage.theme`; quando não há preferência salva, respeita `prefers-color-scheme` do sistema.

---

## Navegação por Teclado

### Skip Link
- Ao pressionar **Tab** na carga da página, o primeiro elemento é o link "Pular para conteúdo principal".
- Ao ativar (Enter), o foco vai para o conteúdo principal (`#main-content`), pulando a barra de título.

### Ordem de Tab
1. Skip link
2. Botões da TitleBar (Alternar tema claro/escuro, Abrir pasta, Esquecer pasta, Executar)
3. Botão Mapa (Sidebar)
4. Itens do explorador de arquivos
5. Abas do editor e botão fechar
6. Botão Salvar
7. Resize handle do explorador
8. Área do editor (Monaco)
9. Resize handle do painel Output
10. Cabeçalho do Output (expandir/colapsar)
11. Botão Limpar output
12. Chat: input, botão enviar
13. Resize handle do Chat

### Modais
- Ao abrir: foco vai para o modal (`tabIndex={-1}` com `focus()`).
- **Escape** fecha o modal.
- Elementos internos do modal seguem ordem natural de Tab.

### Resize Handles
- **Explorador** (lateral esquerda): Tab para focar; ← → para redimensionar.
- **Chat** (lateral direita): Tab para focar; ← → para redimensionar.
- **Output** (inferior): Tab para focar; ↑ ↓ para redimensionar.

---

## Focus Visível

Todos os elementos interativos usam `focus-visible:ring` (não `focus:ring`):
- O ring aparece apenas ao navegar por teclado, não ao clicar com mouse.
- Cor do ring: accent neon (tema escuro) ou accent light (tema claro); variantes semânticas (verde, vermelho, amarelo) em ações específicas.

---

## Leitores de Tela

### ARIA
- **aria-label** em botões que contêm apenas ícones (ex: Fechar, Apagar arquivo).
- **aria-labelledby** em modais (referência ao título).
- **role** em regiões: `complementary`, `region`, `dialog`, `tree`, `tab`, `tabpanel`, `log`, `status`.
- **aria-hidden="true"** em ícones decorativos (dentro de botões com aria-label ou texto visível).
- **aria-expanded** no cabeçalho do painel Output.
- **aria-live="polite"** em regiões com atualização dinâmica (Output, Chat).

### Labels
- Botões de ação com texto visível não precisam de aria-label adicional.
- Botões apenas com ícone: sempre `aria-label` descritivo.

---

## Contraste (WCAG AA)

### Tema escuro (neon)

| Combinação | Ratio | Status |
|------------|-------|--------|
| Texto principal (#e5e5e5) em fundo (#1e1e1e) | 12.6:1 | ✓ AAA |
| Texto secundário (#a3a3a3) em fundo escuro | 4.6:1 | ✓ AA |
| Accent neon (#39ff14) em fundo (#1e1e1e) | ~12:1 | ✓ AAA |
| Accent neon em botões (texto escuro) | Alto | ✓ AA |
| Success / Error em fundo escuro | 4.5:1 | ✓ AA |

### Tema claro

| Combinação | Ratio | Status |
|------------|-------|--------|
| Texto principal (#24292f) em fundo (#ffffff) | 12.5:1 | ✓ AAA |
| Texto secundário (#57606a) em fundo claro | 4.6:1 | ✓ AA |
| Accent light (#00aa44) em fundo (#ffffff) | ~4.5:1 | ✓ AA |
| Bordas e muted | Conformes | ✓ AA |

### Alto contraste
- `@media (prefers-contrast: more)` em `globals.css` aumenta outline de focus (3px, offset 2px) para usuários que preferem alto contraste.

---

## Checklist WCAG 2.1 (Principais)

- [x] **1.3.1 Info e Relações**: Estrutura semântica (main, region, role).
- [x] **2.1.1 Teclado**: Todas as funções acessíveis por teclado.
- [x] **2.1.2 Sem Armadilha de Teclado**: Modais com Escape; Tab circula corretamente.
- [x] **2.4.1 Bypass Blocks**: Skip link "Pular para conteúdo principal".
- [x] **2.4.3 Ordem do Foco**: Ordem lógica de Tab.
- [x] **2.4.7 Focus Visível**: focus-visible:ring em elementos interativos.
- [x] **3.2.1 No Foco**: Nenhuma mudança de contexto ao receber foco.
- [x] **4.1.2 Nome, Função, Valor**: aria-label, role onde necessário.
