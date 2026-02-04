# Fase 7 — Chat e Output

← [Voltar ao planejamento](./planejamento-design.md)

## Objetivo

Melhorar legibilidade e hierarquia do Chat e do painel Output.

---

## Checklist de Ações

- [ ] **7.1 Mensagens do Chat** — Diferenciar visualmente user vs assistant; blocos de código com estilo consistente
- [ ] **7.2 Output** — Cores semânticas para info/success/warning/error; alinhamento com tokens de design
- [ ] **7.3 Scroll e overflow** — Auto-scroll no Output; scroll suave onde fizer sentido

---

## Detalhamento das Ações

| # | Ação | Descrição | Referência |
|---|------|-----------|------------|
| 7.1 | Mensagens do Chat | Diferenciar user vs assistant; blocos de código consistentes | ChatCodeBlock |
| 7.2 | Output | Cores semânticas info/success/warning/error; tokens de design | vscode-msg-* |
| 7.3 | Scroll e overflow | Auto-scroll no Output; scroll suave | UX |

---

## Entregáveis

- **Chat**: bordas laterais (user: accent, assistant: border); tokens ds-text-primary/secondary; ChatCodeBlock com scrollbar-thin
- **Output**: vscode-msg-* para cores semânticas; ds-text-muted para timestamp
- **Scroll**: scroll suave no Output e Chat
