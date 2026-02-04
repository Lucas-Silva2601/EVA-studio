# Fase 5 — Toggle de Tema

← [Voltar ao planejamento](./planejamento-tema-neon.md)

## Objetivo

Adicionar botão na TitleBar para alternar entre tema claro e escuro; persistir em localStorage.

---

## Checklist de Ações

- [ ] **5.1 Botão toggle** — Ícone Sun/Moon na TitleBar; aria-label apropriado
- [ ] **5.2 Hook ou estado** — useTheme ou estado que lê localStorage e aplica classe no html
- [ ] **5.3 Script layout** — Garantir que script no layout aplique "dark" ou "light" conforme localStorage.theme
- [ ] **5.4 Lógica** — Clicar: alternar entre 'dark' e 'light'; salvar em localStorage; aplicar class no documentElement
- [ ] **5.5 Preferência do sistema** — Manter opção de respeitar prefers-color-scheme quando não há preferência salva

---

## Detalhamento das Ações

| # | Ação | Descrição |
|---|------|-----------|
| 5.1 | Botão toggle | Sun (light) / Moon (dark); ao clicar alterna tema |
| 5.2 | Estado | Context ou hook que expõe theme e setTheme |
| 5.3 | Script layout | Já existe; ajustar para aceitar 'light' além de 'dark' |
| 5.4 | Lógica | localStorage.theme = 'dark' | 'light'; document.documentElement.classList.add/remove |
| 5.5 | Preferência | Se !('theme' in localStorage), usar prefers-color-scheme |

---

## Entregáveis

- Botão de toggle na TitleBar
- Alternância fluida entre temas
- Preferência persistida em localStorage
- Documentação em acessibilidade.md (atalho se houver)
