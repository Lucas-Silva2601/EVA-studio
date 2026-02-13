# Changelog — EVA Studio Bridge

Alterações que afetam a extensão. Versão atual: ver `manifest.json` (campo `version`).

## [3.0] e seguintes

- Ponte IDE (localhost:3000) ↔ Gemini (gemini.google.com); protocolo EVA_PROMPT_SEND / EVA_CODE_RETURNED.
- Content scripts: content-ide.js (página da IDE), content-gemini.js (página do Gemini).
- Seletores do Gemini centralizados em `GEMINI_SELECTORS` em content-gemini.js; atualizar quando a UI do site mudar.
- Documentação: docs/protocolo-extensao-ide.md, docs/qa-extensao.md, docs/seguranca-extensao.md.
