# Planejamento — Tema Neon e Toggle Claro/Escuro

> **Objetivo**: Adicionar cores neon (verde) no tema escuro e permitir alternar entre tema claro e escuro.

---

## Contexto

O EVA Studio atualmente usa tema escuro fixo com accent azul (#0e639c). Este planejamento adiciona:
- **Verde neon** como accent principal no tema escuro
- **Tema claro** com paleta adequada
- **Toggle** para alternar entre os temas (localStorage + preferência do sistema)

---

## Fases (Arquivos Detalhados)

Cada fase possui um arquivo próprio com **objetivo**, **checklist de ações** e **entregáveis**:

| # | Fase | Arquivo | Objetivo |
|---|------|---------|----------|
| 1 | Tokens e Paleta Neon | [tema-neon-fase-01-tokens.md](./tema-neon-fase-01-tokens.md) | Definir tokens de cores neon e glow em tailwind e globals.css |
| 2 | Aplicar Neon no Tema Escuro | [tema-neon-fase-02-neon-escuro.md](./tema-neon-fase-02-neon-escuro.md) | Substituir accent azul por verde neon nos componentes |
| 3 | Paleta do Tema Claro | [tema-neon-fase-03-paleta-claro.md](./tema-neon-fase-03-paleta-claro.md) | Definir tokens para light mode (backgrounds, texto, accent) |
| 4 | Componentes Dual (dark:/light:) | [tema-neon-fase-04-componentes-dual.md](./tema-neon-fase-04-componentes-dual.md) | Refatorar componentes para suportar ambos os temas |
| 5 | Toggle de Tema | [tema-neon-fase-05-toggle.md](./tema-neon-fase-05-toggle.md) | Botão na TitleBar e lógica para alternar tema |
| 6 | Polimento e Acessibilidade | [tema-neon-fase-06-polimento.md](./tema-neon-fase-06-polimento.md) | Contraste, transições e ajustes finais |

---

## Priorização Sugerida

| Ordem | Fase | Motivo |
|-------|------|--------|
| 1 | [Fase 1 — Tokens](./tema-neon-fase-01-tokens.md) | Base para todas as outras fases |
| 2 | [Fase 2 — Neon Escuro](./tema-neon-fase-02-neon-escuro.md) | Visual neon imediato no tema atual |
| 3 | [Fase 3 — Paleta Claro](./tema-neon-fase-03-paleta-claro.md) | Tokens necessários para light mode |
| 4 | [Fase 4 — Componentes Dual](./tema-neon-fase-04-componentes-dual.md) | Preparar componentes para ambos os temas |
| 5 | [Fase 5 — Toggle](./tema-neon-fase-05-toggle.md) | Permitir alternar tema |
| 6 | [Fase 6 — Polimento](./tema-neon-fase-06-polimento.md) | Refinamentos finais |

---

## Paleta de Referência

### Tema Escuro (Neon)
- **Accent**: `#39ff14` (verde neon) ou `#00ff88`
- **Accent hover**: `#5fff50`
- **Glow**: `0 0 10px rgba(57, 255, 20, 0.3)`
- **Background**: `#0d1117` ou `#121212`
- **Surface**: `#161b22`

### Tema Claro
- **Accent**: `#00aa44` (verde escuro para contraste)
- **Background**: `#f6f8fa`
- **Surface**: `#ffffff`
- **Texto**: `#24292f`
