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

---

## Navegação por Teclado

### Skip Link
- Ao pressionar **Tab** na carga da página, o primeiro elemento é o link "Pular para conteúdo principal".
- Ao ativar (Enter), o foco vai para o conteúdo principal (`#main-content`), pulando a barra de título.

### Ordem de Tab
1. Skip link
2. Botões da TitleBar (Abrir pasta, Esquecer pasta, Executar)
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
- Cor do ring: `vscode-accent` (azul) ou variantes semânticas (verde, vermelho, amarelo).

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

| Combinação | Ratio | Status |
|------------|-------|--------|
| Texto principal (gray-200) em fundo escuro | 12.6:1 | ✓ AAA |
| Texto secundário (gray-400) em fundo escuro | 4.6:1 | ✓ AA |
| Accent (azul) em fundo escuro | 4.5:1 | ✓ AA |
| Success (verde) em fundo escuro | 4.5:1 | ✓ AA |
| Error (vermelho) em fundo escuro | 4.5:1 | ✓ AA |

### Alto Contraste
- `@media (prefers-contrast: more)` em `globals.css` aumenta outline de focus (3px) para usuários que preferem alto contraste.

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
