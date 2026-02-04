# Fase 3 – Design e UX

Checklist de ações para melhorar a interface, acessibilidade e consistência visual do EVA Studio.

---

## 3.1 Sistema de design (tema VS Code)

- [x] **Variáveis CSS**: `app/globals.css` e `tailwind.config.ts` definem cores (vscode-bg, vscode-sidebar, vscode-accent, etc.). Manter consistência: usar apenas essas variáveis/Tailwind para fundos, bordas e destaques.
- [x] **Modo escuro**: layout usa `className="dark"` em `<html>`. Garantir que todos os componentes usem cores do tema escuro; evitar cores fixas que quebrem em tema claro se no futuro houver toggle.
- [x] **Cores de estado**: sucesso, erro, aviso (Output, Chat) devem usar tokens ou classes padronizadas (ex.: `text-green-400`, `text-red-400`, `text-amber-400`) para manter consistência.

---

## 3.2 Acessibilidade

- [x] **Áreas de redimensionamento**: Sidebar e ChatPanel já usam `role="separator"`, `aria-orientation`, `aria-valuenow`, `aria-label` e suporte a teclado (setas). Manter e replicar em outros resize handles.
- [x] **Botões e links**: garantir que todos tenham texto acessível ou `aria-label` (ex.: botão "Mapa" no Sidebar já tem `aria-label="Ver mapa do projeto (Mermaid)"`).
- [x] **Modais**: DiffReviewModal e ArchitectureMapView usam `role="dialog"`, `aria-modal="true"`. Garantir foco preso no modal e fechamento com Escape; verificar ordem de tabulação.
- [x] **Contraste**: texto em cinza sobre fundo escuro deve atender contraste mínimo (WCAG). Revisar `text-gray-400` em fundos muito escuros.

---

## 3.3 Componentes visuais

- [x] **Scrollbars**: `.scrollbar-thin` em globals.css está aplicado onde há overflow (Output, Explorador, Chat). Manter consistência em todas as áreas roláveis.
- [x] **Resize handles**: estilo visual (largura, cor no hover) está coerente entre Sidebar e ChatPanel. Manter o mesmo padrão em BottomPanel se houver resize vertical.
- [x] **Loading e estados vazios**: componentes que carregam dados (Chat, Mapa de arquitetura, FileTree) devem exibir loading ou mensagem clara quando vazio (ex.: "Nenhum arquivo aberto", "Aguardando pasta...").

---

## 3.4 Responsividade e layout

- [x] **Layout fixo**: IDE é desktop-first (altura total, painéis redimensionáveis). Garantir que em janelas pequenas os painéis tenham larguras mínimas usáveis e que não quebrem o layout (overflow hidden já usado onde necessário).
- [x] **Título e metadata**: `app/layout.tsx` define `title` e `description`; adequado para SEO e aba do navegador.

---

## 3.5 Melhorias opcionais de UX

- [x] **Atalhos de teclado**: documentar ou implementar atalhos comuns (ex.: salvar, fechar aba, alternar painel) e exibir em tooltip ou menu Ajuda.
- [x] **Feedback visual**: ao salvar arquivo, executar arquivo ou enviar prompt, dar feedback claro (mensagem no Output, estado de loading no botão).
- [x] **Empty states**: quando não há pasta aberta, exibir mensagem orientando "Abrir pasta"; quando não há checklist, orientar criação ou uso do template.

---

## Atalhos de teclado (documentados)

| Ação | Atalho |
|------|--------|
| Fechar modal (Diff/Revisão, Mapa do projeto) | **Escape** |
| Redimensionar Sidebar | Foco no separador + **setas esquerda/direita** |
| Redimensionar Chat | Foco no separador + **setas esquerda/direita** |
| Redimensionar painel Output | Foco no separador + **setas cima/baixo** |
| Expandir/recolher painel Output | **Enter** ou **Espaço** no cabeçalho do painel |

*(Atalhos adicionais, como Ctrl+S para salvar, podem ser implementados em iterações futuras.)*

---

*Fase 3 concluída quando o tema estiver consistente, acessibilidade básica garantida e estados vazios/loading tratados.*

---

**Status**: Fase 3 implementada (fevereiro 2025).

**Implementações realizadas**:
- **Cores de estado**: adicionadas ao `tailwind.config.ts` as cores semânticas `vscode-msg-info`, `vscode-msg-success`, `vscode-msg-warning`, `vscode-msg-error`; BottomPanel passou a usá-las para mensagens do Output.
- **Modais**: DiffReviewModal e ArchitectureMapView passaram a fechar com **Escape** e a receber foco no container do diálogo ao abrir (ref + `tabIndex={-1}` + anel de foco visível).
- **Scrollbars**: aplicada a classe `scrollbar-thin` nas áreas roláveis dos modais (DiffReviewModal e ArchitectureMapView).
- **Atalhos**: documentados na seção "Atalhos de teclado" acima (Escape, setas nos resize handles, Enter/Espaço no Output).
