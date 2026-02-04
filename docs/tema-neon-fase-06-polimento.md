# Fase 6 — Polimento e Acessibilidade

← [Voltar ao planejamento](./planejamento-tema-neon.md)

## Objetivo

Verificar contraste em ambos os temas, transições suaves na troca e ajustes finais.

---

## Checklist de Ações

- [ ] **6.1 Contraste WCAG** — Validar ratio em tema claro e escuro (accent neon, texto)
- [ ] **6.2 Transição de tema** — Transição suave (opcional: transition em html ou body)
- [ ] **6.3 Monaco Editor** — Garantir que tema do editor acompanhe (dark/light)
- [ ] **6.4 Alto contraste** — Manter @media (prefers-contrast: more) funcionando
- [ ] **6.5 Documentação** — Atualizar design-tokens.md e acessibilidade.md

---

## Detalhamento das Ações

| # | Ação | Descrição |
|---|------|-----------|
| 6.1 | Contraste | Neon #39ff14 em fundo #121212 ~ 12:1 ✓; Accent light #00aa44 em #fff ~ 4.5:1 ✓ |
| 6.2 | Transição | transition: background-color 200ms, color 200ms no body (opcional) |
| 6.3 | Monaco | theme: 'vs-dark' ou 'vs' conforme tema atual |
| 6.4 | Alto contraste | Manter outline mais forte em prefers-contrast: more |
| 6.5 | Documentação | design-tokens.md: paletas neon e light; acessibilidade: toggle |

---

## Entregáveis

- Contraste validado em ambos os temas
- Transição opcional na troca de tema
- Monaco com tema correto
- Documentação atualizada
