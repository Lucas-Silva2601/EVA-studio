# Fase 2 – Arquitetura do projeto

Checklist de ações para melhorar a estrutura do projeto, alinhada às melhores práticas do Next.js App Router e separação de responsabilidades.

---

## 2.1 Estrutura de pastas (App Router)

- [ ] **Layout raiz**: `app/layout.tsx` define `<html>` e `<body>`; está correto. Manter `metadata` e `lang="pt-BR"`.
- [ ] **Página principal**: `app/page.tsx` é Client Component (`"use client"`) por usar estado e context; está adequado. Evitar colocar lógica pesada direto na página; manter em hooks e componentes.
- [ ] **Rotas de API**: única rota é `app/api/groq/route.ts`. Manter rotas sob `app/api/`; não misturar com páginas. Considerar subpastas por domínio se surgirem mais endpoints (ex.: `app/api/groq/`, `app/api/health/`).
- [ ] **Evitar pasta `pages/`**: não criar `pages/`; o projeto usa apenas App Router. Documentar isso em README ou em `docs/00-INDICE.md`.

---

## 2.2 Server vs Client Components

- [ ] **Identificar componentes que precisam de "use client"**: apenas onde há estado, eventos, `useEffect`, browser APIs (File System Access, IndexedDB, postMessage). Ex.: `page.tsx`, `useIdeState`, Sidebar, ChatPanel, EditorArea.
- [ ] **Manter Server Components onde possível**: `app/layout.tsx` pode permanecer Server Component (não usa hooks nem browser APIs). Componentes que só exibem dados ou layout estático podem ser Server Components se não dependerem de contexto da IDE.
- [ ] **Lazy loading**: componentes pesados (Monaco, Mermaid) já usam `import()` dinâmico. Para Mermaid, considerar `next/dynamic` com `ssr: false` no componente que renderiza o diagrama, para evitar resolução de módulo no servidor (ver documentação Next.js sobre dynamic import client-only).

---

## 2.3 Organização de código

- [ ] **`lib/`**: agrupa fileSystem, groq, runtime, sanitize, messaging, indexedDB, etc. Manter; são utilitários e serviços. Evitar arquivos gigantes; se um módulo crescer muito, dividir por domínio (ex.: `lib/groq/analyze.ts`, `lib/groq/chat.ts`).
- [ ] **`hooks/`**: `useIdeState.tsx` é grande (muitas responsabilidades). Considerar extrair sub-hooks ou funções para `lib/` (ex.: lógica de checklist, lógica de diff, lógica de execução) para facilitar testes e leitura.
- [ ] **`types/`**: tipos globais em `types/index.ts` e `types/global.d.ts`. Manter tipos compartilhados aqui; evitar duplicar interfaces entre `lib/` e componentes.
- [ ] **`components/`**: subpastas `layout/`, `editor/`, `file-explorer/` estão coerentes. Manter convenção: um componente por arquivo, nomes em PascalCase.

---

## 2.4 API e ambiente

- [ ] **Variáveis de ambiente**: Next.js carrega `.env.local` automaticamente; usar apenas no servidor (rotas API). Não expor `GROQ_API_KEY` com `NEXT_PUBLIC_`. Já está correto em `app/api/groq/route.ts`.
- [ ] **Route Handlers**: usar `POST` para ações do Analista (analyze, chat, validate, etc.); o cliente já envia `action` no body. Manter um único endpoint `/api/groq` com dispatch por `action` ou considerar rotas separadas no futuro (ex.: `/api/groq/analyze`, `/api/groq/chat`) se a rota atual ficar difícil de manter.

---

## 2.5 Tipos e contratos

- [ ] **Tipos da extensão**: `lib/messaging.ts` define payloads (CodeResponsePayload, etc.). Manter contratos documentados (comentários ou tipo compartilhado) para a extensão Chrome; evita quebra ao alterar formato.
- [ ] **Tipos Groq**: resultados de análise e validação (`ChecklistAnalysisResult`, `ValidationResult`) estão em `types/index.ts`. Manter sincronizados com o JSON retornado pela API e com o parsing em `lib/groq.ts`.

---

## 2.6 Resumo – boas práticas aplicadas

- App Router como única fonte de rotas; sem `pages/`.
- Server Components onde não há interatividade; Client Components com "use client" apenas onde necessário.
- Lazy load de Mermaid e Monaco para reduzir bundle inicial.
- `lib/` para serviços; `hooks/` para estado e efeitos; `types/` centralizado.
- API key apenas no servidor; Route Handlers em `app/api/`.

---

*Fase 2 concluída quando a estrutura estiver alinhada aos itens acima e não houver mistura desnecessária de responsabilidades.*
