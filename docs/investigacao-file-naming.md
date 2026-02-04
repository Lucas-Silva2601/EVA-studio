# Investigação — Arquivos com .txt e nomes aleatórios

## Problema

Arquivos pedidos pela extensão (via Gemini) estavam sendo salvos com:
- Extensão `.txt` mesmo quando o conteúdo indica outro tipo (ex: HTML)
- Nomes genéricos como `file_0.txt`, `file_1.txt` em vez dos nomes escolhidos pela IA

## Causa raiz

O fluxo passa por **dois pontos**:

### 1. Extensão Chrome (content-gemini.js)

A extensão extrai blocos de código da página do Gemini e converte em `files[]`. O nome e a extensão eram definidos assim:

1. **FILE: na primeira linha** — Se o Gemini colocasse `FILE: index.html` na primeira linha, funcionava.
2. **Fallback** — Se não houvesse FILE:, usava `file_N.` + `langToExt(block.language)`.
3. **langToExt** — Retornava `"txt"` quando `block.language` estava vazio.
4. **Problema** — O Gemini nem sempre:
   - Coloca FILE: na primeira linha
   - Faz com que o bloco tenha `language-xxx` no DOM
   - A classe `language-html` etc. pode não existir na estrutura do Gemini

Resultado: `file_0.txt`, `file_1.txt` quando FILE: e language faltavam.

### 2. EVA Studio (messaging.ts)

Quando a extensão envia `files[]`, o `normalizeToFiles` retornava os arquivos **sem reprocessar**. Ou seja, `file_0.txt` era aceito como está.

## Correções implementadas

### Extensão (content-gemini.js)

1. **parseFileFromContent** — Procura FILE: nas primeiras 10 linhas (não só na primeira).
2. **inferFilenameFromContent** — Infere nome e extensão pelo conteúdo:
   - `<!DOCTYPE` ou `<html` → `index.html`
   - `# heading` ou `- [ ]` → `checklist.md`
   - `{` ou `[` no início → `data.json`
   - `def ` ou `import ` (Python) → `script.py`
   - `function ` ou `export ` → `script.js`
   - etc.
3. **langToExt** — Retorna `""` em vez de `"txt"` quando a linguagem é vazia.
4. **blocksToFiles** — Ordem de prioridade:
   - FILE: na primeira linha
   - FILE: em qualquer linha inicial (até 10)
   - inferFilenameFromContent
   - `file_N.ext` com extensão da linguagem
   - `file_N.txt` apenas como último recurso

### EVA Studio (messaging.ts)

1. **isGenericFilename** — Detecta `file_N.txt`.
2. **normalizeToFiles** — Se algum arquivo tiver nome genérico, tenta `inferFilenameFromContent` no conteúdo e corrige o nome.

### Prompts Groq (já existentes)

Os prompts em `app/api/groq/route.ts` já exigem:

- "O Gemini DEVE retornar o código com a primeira linha sendo exatamente FILE: caminho/nome.ext"
- "NUNCA use .txt nem nome genérico 'file'"

O problema estava no processamento quando o Gemini não seguia isso.

## Sobre o design

As alterações nas 7 fases focaram em:

- **Consistência** — tokens, cores, acessibilidade
- **Padrões** — botões, resize handles, tipografia
- **Microinterações** — transições, feedback de salvar

Mudanças mais visíveis (cores, layout, espaçamento) foram feitas, mas podem parecer discretas se o foco era em “design grande” ou tema novo. Para impacto visual maior, seria necessário, por exemplo:

- Novo tema de cores ou variações visuais mais fortes
- Mudanças de layout (sidebar, painéis)
- Novos componentes ou padrões visuais

## Como testar

1. Recarregue a extensão em `chrome://extensions` (Carregar sem compactação).
2. Execute o loop com um checklist que peça HTML e Markdown.
3. Verifique se os arquivos são salvos como `index.html`, `checklist.md` etc., em vez de `file_0.txt`, `file_1.txt`.
