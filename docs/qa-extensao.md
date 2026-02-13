# QA — Extensão EVA Studio Bridge

Checklist manual para validar o fluxo da extensão antes de um release. Executar com a IDE em `http://localhost:3000` (ou 3001) e o Chrome com a extensão carregada.

---

## Onde inspecionar

- **Service Worker (background):** `chrome://extensions` → EVA Studio Bridge → “Service worker” (link “inspecionar”).
- **Console da aba IDE:** Aba da IDE (localhost:3000) → F12 → Console.
- **Console da aba Gemini:** Aba aberta em gemini.google.com → F12 → Console.
- **Popup:** Clicar no ícone da extensão na barra; não há console próprio (erros podem aparecer no contexto da extensão).

---

## Cenários

### 1. Fluxo feliz

1. Abrir a IDE em `http://localhost:3000` (ou 127.0.0.1:3000).
2. Abrir uma aba em `https://gemini.google.com` (ou www.gemini.google.com) e deixar carregar.
3. Na IDE, disparar o envio de um prompt para o Gemini (ex.: “Implementar próxima tarefa” ou enviar um prompt que gere código).
4. **Esperado:** O prompt aparece no Gemini, a resposta é gerada e o código retorna à IDE (aplicado ou exibido no painel/chat).
5. **Consoles:** Sem erros não tratados no Service Worker, na aba IDE ou na aba Gemini.

### 2. Extensão não instalada

1. Desabilitar ou desinstalar a extensão EVA Studio Bridge.
2. Com a IDE aberta em localhost:3000, tentar enviar prompt ou verificar status da extensão.
3. **Esperado:** A IDE mostra mensagem clara (ex.: “Extensão não disponível” ou “Verifique se a EVA Studio Bridge está instalada”).
4. Reinstalar/habilitar a extensão e repetir o fluxo feliz.

### 3. Gemini não aberto

1. Fechar todas as abas do Gemini (gemini.google.com).
2. Com a IDE aberta, enviar um prompt.
3. **Esperado:** A IDE recebe erro do tipo “Abra o Google Gemini (gemini.google.com) em uma aba primeiro”.
4. **Console do Service Worker:** Pode aparecer aviso “[EVA Bridge] Nenhuma aba do Gemini encontrada”.

### 4. Aba do Gemini fechada durante o envio

1. Iniciar o envio de um prompt na IDE (Gemini aberto).
2. Antes da resposta terminar, fechar a aba do Gemini.
3. **Esperado:** A IDE recebe uma mensagem de erro compreensível (ex.: “Aba do Gemini fechada ou indisponível. Recarregue a aba do Gemini (F5)…”).
4. **Consoles:** Nenhum erro não tratado (ex.: “Receiving end does not exist” sem tratamento).

### 5. Extensão atualizada com páginas abertas

1. Com a aba do Gemini aberta e (opcionalmente) a IDE aberta, em `chrome://extensions` clicar em “Recarregar” na EVA Studio Bridge.
2. **Esperado (Gemini):** Banner na página do Gemini: “EVA Studio Bridge: a extensão foi atualizada. Recarregue esta página (F5) para reconectar.”
3. Recarregar a página do Gemini (F5).
4. **Esperado:** O fluxo feliz volta a funcionar (enviar prompt da IDE → código retorna).

---

## Após alterar seletores do Gemini

Se a UI do Gemini (gemini.google.com) mudar e você atualizar `GEMINI_SELECTORS` em `chrome-extension/content-gemini.js`:

1. Recarregar a extensão em `chrome://extensions`.
2. Recarregar a aba do Gemini (F5).
3. Executar o **Fluxo feliz** (cenário 1) pelo menos uma vez.
4. Se o input ou o botão de envio não forem encontrados, a extensão envia “Caixa de prompt do Gemini não encontrada” ou “Botão de envio não encontrado” — use F12 no Gemini para inspecionar os novos seletores (aria-label, role, data-*, classes).
