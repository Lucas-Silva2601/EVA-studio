"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  MessageCircle,
  MessageSquare,
  Trash2,
  Paperclip,
  CheckCircle2,
  Circle,
  Play,
  PlayCircle,
  ChevronDown,
  Loader2,
  AlertTriangle,
  Pencil,
  RotateCcw,
  Settings,
} from "lucide-react";
import { ChatInput, type ChatInputImage } from "@/components/layout/ChatInput";
import { useIdeState } from "@/hooks/useIdeState";
import {
  chatWithAnalyst,
  chatToChecklistTasks,
  compareCodeChanges,
  applyImplementation,
  type ChatProvider
} from "@/lib/groq";
import { getProjectContext } from "@/lib/contextPacker";
import { getChatMessages, saveChatMessages } from "@/lib/indexedDB";
import { ChatCodeBlock } from "@/components/layout/ChatCodeBlock";
import { waitForCodeFromExtension, FILENAME_ASK_GROQ } from "@/lib/messaging";
import { extractRawPrompt, parseEvaActions, type EvaAction } from "@/lib/evaActions";
import { verifyPermission } from "@/lib/fileSystem";
import { ImplementationReview } from "@/components/layout/ImplementationReview";
const GEMINI_PROMPT_TEMPLATE = (userRequest: string) => `
ESTADO ATUAL DO PROJETO E PEDIDO DO USUÁRIO:
${userRequest}

REGRAS OBRIGATÓRIAS DE RETORNO:
1. Use SEMPRE o formato FILE: caminho/pasta/arquivo.ext seguido de bloco de código markdown.
2. NUNCA use extensões genéricas como .txt para código (.py, .js, .tsx, etc.).
3. Respeite INTEGRALMENTE a estrutura de pastas sugerida ou existente.
4. Coloque o nome do arquivo como comentário na primeira linha (ex: # filename: main.py).
5. Forneça a implementação completa e funcional.
`;


export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** Imagens anexadas pelo usuário (exibidas no histórico do chat). */
  images?: ChatInputImage[];
  /** true quando a resposta foi cortada por limite de tokens (finish_reason === 'length' ou bloco de código aberto). */
  isTruncated?: boolean;
  /** true quando a mensagem é sugestão de autocura após erro de execução (botão "Aplicar Autocura"). */
  isAutocura?: boolean;
};

/**
 * Fase 11: Interface de Chat EVA (Humano <-> Analista).
 * Usado no painel direito (ChatPanel) com altura total. Comunicação com o Agente Analista (Groq).
 * Mantém histórico e inclui contexto do arquivo aberto no editor.
 * Comando de gatilho: traduzir ordem em tarefas no checklist e disparar o loop.
 */
export function ChatSidebar() {
  const {
    activeFilePath,
    openFiles,
    directoryHandle,
    fileTree,
    folderName,
    readChecklist,
    writeChecklist,
    addOutputMessage,
    setCurrentChecklistTask,
    nextPendingTask,
    setNextPendingTask,
    getChecklistProgress,
    getNextTaskFromContent,
    getTasksForPhase,
    loopAutoRunning,
    setLoopAutoRunning,
    executeEvaActions,
    createFileWithContent,
    refreshFileTree,
    readFileContent,
    pendingReviewActions,
    setPendingReviewActions,
  } = useIdeState();

  const projectId = folderName ?? "Projeto não aberto";
  const projectIdForStorage = folderName ?? "default";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingContinue, setLoadingContinue] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingAIStudio, setLoadingAIStudio] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [progress, setProgress] = useState<{ totalPending: number; completedCount: number } | null>(null);
  const [pendingImages, setPendingImages] = useState<ChatInputImage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /** Envia prompt ao AI Studio via extensão; ao receber código, abre o diff e opcionalmente adiciona mensagem no chat (repassar ao Groq). */
  const sendTaskToAIStudio = useCallback(
    async (
      prompt: string,
      task?: { taskLine: string; taskDescription: string },
      phaseLines?: string[], // mantido para compatibilidade de assinatura se necessário
      images?: ChatInputImage[],
      isManualChat?: boolean
    ) => {
      if (!directoryHandle || !prompt.trim()) return;

      setLoadingAIStudio(true);
      addOutputMessage({ type: "info", text: "Enviando tarefa ao AI Studio (extensão). Aguarde..." });
      if (task) setCurrentChecklistTask(task);
      try {
        const result = await waitForCodeFromExtension(
          prompt,
          6 * 60 * 1000,
          () => addOutputMessage({ type: "warning", text: "Extensão não detectada. Instale a EVA Studio Bridge." }),
          images
        );
        if (!result.ok) {
          addOutputMessage({ type: "error", text: result.error ?? "Erro ao receber do AI Studio." });
          setLoadingAIStudio(false);
          return;
        }
        const files = result.files ?? (result.filename || result.code ? [{ name: result.filename ?? "file.txt", content: result.code }] : []);
        const validFiles = files.filter((f) => f.name !== FILENAME_ASK_GROQ);
        if (validFiles.length === 0) {
          addOutputMessage({ type: "warning", text: "Nenhum arquivo válido recebido do AI Studio." });
          setLoadingAIStudio(false);
          return;
        }

        const normalizedFiles = validFiles.map((f) => {
          const pathNorm = f.name.replace(/\\/g, "/");
          return { filePath: pathNorm, proposedContent: f.content };
        });

        for (const f of normalizedFiles) {
          try {
            if (f.filePath.startsWith("file_")) continue;

            let originalContent = "";
            let exists = true;
            try {
              originalContent = await readFileContent(f.filePath);
            } catch {
              exists = false;
            }

            if (!exists) {
              await createFileWithContent(f.filePath, f.proposedContent);
              addOutputMessage({ type: "success", text: `Novo arquivo criado via AI Studio: ${f.filePath}` });
              refreshFileTree();
            } else {
              setPendingReviewActions([
                ...(pendingReviewActions || []),
                {
                  action: "CREATE_FILE",
                  path: f.filePath,
                  content: f.proposedContent,
                }
              ]);
              addOutputMessage({ type: "info", text: `Edição capturada via AI Studio aguardando revisão: ${f.filePath}` });
            }
          } catch (err) {
            console.error(`Erro ao processar review do AI Studio: ${f.filePath}`, err);
          }
        }

        let rawGeminiResponse = result.code || "";
        if (!rawGeminiResponse && result.files) {
          rawGeminiResponse = result.files.map(f => `FILE: ${f.name}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
        }

        if (isManualChat) {
          // CHAT MANUAL: 1. Exibe a resposta BRUTA do Gemini imediatamente.
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: rawGeminiResponse || "Resposta recebida.",
            },
          ]);

          // 2. OTIMIZAÇÃO SILENCIOSA: Chama o Analista em background apenas para gerar o Painel de Revisão [EVA_ACTION]
          // Não atualizamos a mensagem do chat para não "interferir" no texto que o usuário recebeu.
          (async () => {
            try {
              const checklistContext = await getChecklistContentForContext();
              const projectContext =
                directoryHandle && fileTree.length > 0
                  ? await getProjectContext(directoryHandle, fileTree)
                  : "";

              addOutputMessage({ type: "info", text: "Gerando ações de revisão..." });
              const optimized = await applyImplementation({
                userRequest: prompt,
                geminiOutput: rawGeminiResponse,
                projectId: folderName ?? "unknown",
                // @ts-ignore - Estendendo payload para incluir contextos para o Analista
                projectContext,
                checklistContext,
              });

              if (optimized.content) {
                const actions = parseEvaActions(optimized.content);
                if (actions.length > 0) {
                  // Só pede review se houver edições de arquivos existentes ou movimentações
                  let needsReview = false;
                  for (const action of actions) {
                    if (action.action === 'PATCH_FILE') {
                      needsReview = true;
                      break;
                    }
                    if (action.action === 'CREATE_FILE') {
                      try {
                        await readFileContent(action.path);
                        needsReview = true; // Arquivo existe, é edição
                        break;
                      } catch {
                        // Arquivo não existe, é criação
                      }
                    }
                  }

                  if (needsReview) {
                    setPendingReviewActions(actions);
                  } else {
                    // Se for só criação/diretório/comando, executa direto
                    await executeEvaActions(optimized.content);
                    addOutputMessage({ type: "success", text: "Estrutura inicial implementada automaticamente." });
                  }
                }
              }
            } catch (err) {
              console.warn("Erro na otimização silenciosa:", err);
            }
          })();

          // Tenta capturar mudanças para o Code Review
          await applyCodeFromResponse(rawGeminiResponse);
        } else {
          // TAREFA AUTOMÁTICA: Pós-processa o output do Gemini usando o Analista (Groq)
          addOutputMessage({ type: "info", text: "Otimizando implementação com o Analista..." });
          const optimized = await applyImplementation({
            userRequest: prompt,
            geminiOutput: rawGeminiResponse,
            projectId: folderName ?? "unknown",
          });

          if (optimized.content) {
            // 1. Extrai as ações [EVA_ACTION] geradas pelo Analista (PATCH_FILE, etc.)
            const actions = parseEvaActions(optimized.content);

            if (actions.length > 0) {
              let needsReview = false;
              for (const action of actions) {
                if (action.action === 'PATCH_FILE') {
                  needsReview = true;
                  break;
                }
                if (action.action === 'CREATE_FILE') {
                  try {
                    await readFileContent(action.path);
                    needsReview = true;
                    break;
                  } catch { }
                }
              }

              if (needsReview) {
                setPendingReviewActions(actions);
              } else {
                await executeEvaActions(optimized.content);
                addOutputMessage({ type: "success", text: "Mudanças automáticas aplicadas." });
              }
            }

            // 2. Filtra o conteúdo para o chat
            const chatDisplayContent = optimized.content
              .split('\n')
              .filter(line => !line.trim().startsWith('[EVA_ACTION]'))
              .join('\n')
              .replace(/^Parecer:\s*/i, "")
              .replace(/```[\s\S]*?```/g, "")
              .trim();

            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: chatDisplayContent || "Implementação finalizada com sucesso."
              }
            ]);
          }
        }

        refreshFileTree();
        addOutputMessage({ type: "success", text: "Processamento concluído." });
      } catch (err) {
        addOutputMessage({ type: "error", text: `Falha no processamento: ${(err as Error).message}` });
      } finally {
        setLoadingAIStudio(false);
      }
    },
    [
      directoryHandle,
      folderName,
      addOutputMessage,
      setCurrentChecklistTask,
      executeEvaActions,
      refreshFileTree,
      createFileWithContent,
      setPendingReviewActions,
    ]
  );


  /** Envia automaticamente a próxima tarefa do checklist ao AI Studio (quando não há prompt explícito na resposta do Groq). */
  const sendNextTaskToAIStudioIfAny = useCallback(async () => {
    if (!directoryHandle) return;
    try {
      const openChecklist = activeFilePath === "checklist.md" ? openFiles.find((f) => f.path === "checklist.md") : null;
      const checklistContent = openChecklist ? openChecklist.content : await readChecklist();
      const nextTask = await getNextTaskFromContent(checklistContent);
      if (!nextTask) return;
      const prompt = nextTask.taskDescription;
      await sendTaskToAIStudio(prompt, nextTask, []);
    } catch {
      // Silencioso: não interrompe o fluxo do chat
    }
  }, [
    directoryHandle,
    activeFilePath,
    openFiles,
    readChecklist,
    getNextTaskFromContent,
    sendTaskToAIStudio,
  ]);

  const handleStopGenerating = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastIsTruncated = lastMessage?.role === "assistant" && lastMessage?.isTruncated === true;

  const activeFile = activeFilePath
    ? openFiles.find((f) => f.path === activeFilePath)
    : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const loadedForProjectRef = useRef<string | null>(null);

  /** Carrega histórico do chat do projeto ao abrir/trocar de pasta (conversa por projeto). */
  useEffect(() => {
    if (!projectIdForStorage) return;
    loadedForProjectRef.current = null;
    getChatMessages(projectIdForStorage).then((stored) => {
      if (Array.isArray(stored)) {
        setMessages(stored as ChatMessage[]);
      }
      loadedForProjectRef.current = projectIdForStorage;
    });
  }, [projectIdForStorage]);

  /** Persiste mensagens do chat por projeto (evita sobrescrever com [] antes de carregar). */
  useEffect(() => {
    if (!projectIdForStorage || loadedForProjectRef.current !== projectIdForStorage) return;
    saveChatMessages(projectIdForStorage, messages);
  }, [projectIdForStorage, messages]);



  const getChecklistContentForContext = async (): Promise<string> => {
    if (activeFile?.path === "checklist.md") return activeFile.content;
    if (!directoryHandle) return "";
    try {
      return await readChecklist();
    } catch {
      return "";
    }
  };

  /**
   * Função de Captura de Código para Review (IDE EVA)
   * Detecta blocos de código e envia para a fila de revisão ou salva automaticamente.
   */
  const applyCodeFromResponse = useCallback(
    async (responseText: string) => {
      if (!directoryHandle) return;

      // Regra de Ouro: Ignora prompst de comando do sistema para evitar auto-save acidental de exemplos.
      if (
        responseText.includes("[EVA_ACTION]") ||
        responseText.includes("REGRAS DE RETORNO") ||
        responseText.includes("REGRAS DE RESPOSTA") ||
        responseText.includes("REGRAS DE OURO")
      ) {
        return;
      }

      const actionsToReview: EvaAction[] = [];

      // Regex Mestre provido pelo Usuário: captura caminho limpo e o código
      const fileRegex = /(?:FILE:|Ficheiro:|File:|\/\/|\/\*|#)\s*([a-zA-Z0-9_\-\/.]+\.[a-zA-Z0-9]+)(?:.*?)[\r\n]+\`\`\`(?:\w+)?[\r\n]([\s\S]*?)\`\`\`/g;

      let match;
      while ((match = fileRegex.exec(responseText)) !== null) {
        const filePath = match[1].trim();
        const codeContent = match[2];

        if (!filePath || filePath.includes("caminho/do/arquivo") || filePath.toLowerCase().includes("exemplo")) continue;

        try {
          const pathNorm = filePath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
          let exists = true;

          try {
            await readFileContent(pathNorm);
          } catch {
            exists = false;
          }

          if (!exists) {
            // Arquivo novo: Auto-Save Silencioso
            await createFileWithContent(pathNorm, codeContent.trim());
            addOutputMessage({ type: "success", text: `Novo arquivo criado via auto-save: ${pathNorm}` });
            refreshFileTree();
          } else {
            // Arquivo existente: Envia para o Modal Review Interativo
            actionsToReview.push({
              action: "CREATE_FILE",
              path: pathNorm,
              content: codeContent.trim(),
            });
          }

        } catch (error) {
          console.error(`[EVA-AUTO] Erro ao processar arquivo ${filePath}:`, error);
        }
      }

      if (actionsToReview.length > 0) {
        // Envia as ações pendentes para o painel de revisão e avisa o usuário
        setPendingReviewActions(actionsToReview);
        addOutputMessage({ type: "warning", text: `Substituições de arquivos aguardando sua revisão e aprovação.` });
      }
    },
    [directoryHandle, readFileContent, createFileWithContent, addOutputMessage, refreshFileTree, setPendingReviewActions]
  );


  const handleGenerateSnapshot = async () => {
    if (!directoryHandle) {
      addOutputMessage({ type: "error", text: "Abra uma pasta antes de gerar o contexto." });
      return;
    }
    setLoadingContext(true);
    try {
      addOutputMessage({ type: "info", text: "Gerando snapshot do projeto..." });
      const rawContext = await getProjectContext(directoryHandle, fileTree);
      const snapshotPrompt = `CONTEXTO DO PROJETO (MIGRAÇÃO DE CHAT)\n\nEstou iniciando uma nova sessão para continuar o desenvolvimento deste projeto.\nAbaixo está a estrutura atual e o código dos arquivos.\n\n${rawContext}\n\nINSTRUÇÃO:\nAnalise o projeto acima. Não gere código agora. Apenas responda: "Contexto Carregado. Qual a próxima tarefa?"`;
      await navigator.clipboard.writeText(snapshotPrompt);
      addOutputMessage({ type: "success", text: "Contexto copiado! Cole em um novo chat do Gemini." });
    } catch (err) {
      addOutputMessage({ type: "error", text: "Erro ao gerar contexto: " + (err as Error).message });
    } finally {
      setLoadingContext(false);
    }
  };

  const handleImplement = useCallback(
    async (filePath: string, proposedContent: string) => {
      try {
        await createFileWithContent(filePath, proposedContent);
        addOutputMessage({ type: "success", text: `Arquivo salvo: ${filePath}` });
        await refreshFileTree();
      } catch (err) {
        addOutputMessage({ type: "error", text: `Erro ao salvar ${filePath}: ${(err as Error).message}` });
      }
    },
    [createFileWithContent, addOutputMessage, refreshFileTree]
  );

  const handleImplementAll = useCallback(
    async (files: { filePath: string; content: string }[]) => {
      for (const f of files) {
        try {
          await createFileWithContent(f.filePath, f.content);
        } catch (err) {
          addOutputMessage({ type: "error", text: `Erro ao salvar ${f.filePath}: ${(err as Error).message}` });
        }
      }
      addOutputMessage({ type: "success", text: `${files.length} arquivos implementados.` });
      await refreshFileTree();
    },
    [createFileWithContent, addOutputMessage, refreshFileTree]
  );

  const CONTINUATION_PROMPT =
    "Sua resposta anterior foi cortada pelo limite de tokens. Por favor, continue a geração EXATAMENTE de onde você parou. Não repita o contexto inicial, apenas complete o código ou texto pendente.";

  const handleContinueGenerating = useCallback(async () => {
    if (!lastIsTruncated || loadingContinue || loading) return;
    const lastAssistant = lastMessage?.role === "assistant" ? lastMessage : null;
    if (!lastAssistant) return;
    setLoadingContinue(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const continuationUserMsg: ChatMessage = {
        role: "user",
        content: CONTINUATION_PROMPT,
      };
      const historyWithContinuation = [...messages, continuationUserMsg];
      const openFileContext =
        activeFile != null
          ? { path: activeFile.path, content: activeFile.content }
          : null;
      const checklistContext = directoryHandle ? await getChecklistContentForContext() : "";
      const projectContext =
        directoryHandle && fileTree.length > 0
          ? await getProjectContext(directoryHandle, fileTree)
          : "";
      const reply = await chatWithAnalyst({
        provider: "groq",
        messages: historyWithContinuation,
        projectId,
        projectContext: projectContext || undefined,
        openFileContext,
        checklistContext: checklistContext || undefined,
        signal: controller.signal,
      });
      const mergedContent = lastAssistant.content + reply.content;
      setMessages((prev) => {
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (lastIdx >= 0 && next[lastIdx].role === "assistant") {
          next[lastIdx] = {
            ...next[lastIdx],
            content: mergedContent,
            isTruncated: reply.isTruncated,
          };
        }
        return next;
      });
      applyCodeFromResponse(mergedContent);
      executeEvaActions(reply.content);
      const promptForAIStudio = extractRawPrompt(mergedContent);
      if (promptForAIStudio) {
        sendTaskToAIStudio(promptForAIStudio);
      } else {
        sendNextTaskToAIStudioIfAny();
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        addOutputMessage({ type: "info", text: "Continuação interrompida." });
        return;
      }
      const errorMsg = err instanceof Error ? err.message : "Erro ao continuar.";
      addOutputMessage({ type: "error", text: errorMsg });
    } finally {
      abortControllerRef.current = null;
      setLoadingContinue(false);
    }
  }, [
    lastIsTruncated,
    lastMessage,
    messages,
    loadingContinue,
    loading,
    projectId,
    directoryHandle,
    fileTree,
    activeFile,
    addOutputMessage,
    getChecklistContentForContext,
    executeEvaActions,
    sendTaskToAIStudio,
    sendNextTaskToAIStudioIfAny,
  ]);

  const handleSend = async (imgs: ChatInputImage[] = []) => {
    const text = input.trim();
    if ((!text && imgs.length === 0) || loading) return;

    setInput("");
    setPendingImages([]);
    const userMsg: ChatMessage = {
      role: "user",
      content: text || (imgs.length > 0 ? "[Imagem(ns) anexada(s)]" : ""),
      images: imgs.length > 0 ? imgs : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 2. Dispara diretamente para o AI Studio com o texto BRUTO do usuário
      // O usuário solicitou que o Groq não interfira e que seja enviado apenas o que ele escreveu.
      await sendTaskToAIStudio(text, undefined, undefined, userMsg.images, true);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro ao enviar mensagem.";
      addOutputMessage({ type: "error", text: errorMsg });
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleTranslateAndRun = async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userMessage = lastUser?.content?.trim();
    if (!userMessage) {
      addOutputMessage({ type: "warning", text: "Envie uma mensagem no chat antes de usar esta ação." });
      return;
    }
    if (!directoryHandle) {
      addOutputMessage({ type: "error", text: "Abra uma pasta antes de adicionar tarefas ao checklist." });
      return;
    }
    setLoadingTasks(true);
    try {
      const checklistContent =
        activeFile?.path === "checklist.md" ? activeFile.content : await readChecklist();
      const newLines = await chatToChecklistTasks({
        userMessage,
        checklistContent,
      });
      const trimmed = newLines.trim();
      if (!trimmed) {
        addOutputMessage({ type: "warning", text: "O Analista não retornou linhas de checklist." });
        setLoadingTasks(false);
        return;
      }
      const toAppend = trimmed
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && /^\s*-\s*\[\s?[x ]\s?\]/.test(l))
        .join("\n");
      if (!toAppend) {
        addOutputMessage({ type: "warning", text: "Nenhuma linha de checklist válida retornada." });
        setLoadingTasks(false);
        return;
      }
      const newContent = checklistContent.trimEnd() + "\n\n" + toAppend + "\n";
      await writeChecklist(newContent);
      const nextTask = await getNextTaskFromContent(newContent);
      if (nextTask) setCurrentChecklistTask(nextTask);
      getChecklistProgress().then(setProgress);
      addOutputMessage({
        type: "success",
        text: "Tarefas adicionadas ao checklist.",
      });
    } catch (err) {
      addOutputMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao traduzir em tarefas.",
      });
    } finally {
      setLoadingTasks(false);
    }
  };


  useEffect(() => {
    if (!directoryHandle) {
      setProgress(null);
      return;
    }
    getChecklistProgress().then(setProgress);
  }, [directoryHandle, getChecklistProgress, nextPendingTask]);

  return (
    <div className="flex flex-col h-full bg-ds-surface-light dark:bg-ds-surface border-l border-ds-border-light dark:border-ds-border relative overflow-hidden">
      <div className="flex items-center justify-between h-14 px-4 border-b border-white/[0.06] bg-black/40">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-white/40" />
          <h2 className="text-xs font-semibold tracking-wider text-white/50 uppercase">Chat EVA</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateSnapshot}
            disabled={loadingContext}
            className={`p-1.5 hover:bg-white/5 rounded-md transition-colors ${loadingContext ? 'text-ds-accent-neon animate-spin' : 'text-white/40 hover:text-ds-accent-neon'}`}
            title="Gerar Contexto para Novo Chat (snapshot)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMessages([])}
            className="p-1.5 hover:bg-white/5 rounded-md transition-colors text-white/40 hover:text-white/70"
            title="Limpar chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 space-y-2 text-sm scrollbar-thin [scroll-behavior:smooth]"
        role="log"
        aria-live="polite"
        aria-label="Histórico do chat"
        style={{ scrollbarWidth: "thin" }}
      >
        {messages.length === 0 && (
          <p className="text-ds-text-primary-light dark:text-ds-text-primary text-xs py-2">
            Converse com o Analista (Groq). Projeto: <strong>{projectId}</strong>. A IA pode gerar código via blocos [EVA_ACTION] e você pode aplicar com &quot;Implementar Mudanças&quot;.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-4 flex flex-col gap-0.5"
                : "mr-4 flex flex-col gap-0.5"
            }
          >
            <div
              className={`rounded-md px-2 py-1.5 break-words border-l-2 ${m.role === "user"
                ? "bg-ds-accent-neon/20 border-ds-accent-neon text-ds-text-primary-light dark:text-ds-text-primary"
                : "bg-ds-bg-secondary-light dark:bg-vscode-bg/80 text-ds-text-primary-light dark:text-ds-text-primary border-ds-border-light dark:border-vscode-border"
                }`}
            >
              <span className="text-[10px] font-medium text-ds-text-secondary-light dark:text-ds-text-secondary block mb-0.5">
                {m.role === "user" ? "Você" : "Engenheiro Chefe"}
              </span>
              {m.role === "user" ? (
                <>
                  {m.content ? (
                    <div className="whitespace-pre-wrap text-ds-text-primary-light dark:text-ds-text-primary">{m.content}</div>
                  ) : null}
                  {m.images && m.images.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {m.images.map((img, idx) => (
                        <img
                          key={idx}
                          src={img.dataUrl}
                          alt={img.name}
                          className="max-h-32 max-w-full rounded border border-ds-border-light dark:border-ds-border object-contain bg-ds-bg-secondary-light dark:bg-ds-bg-secondary"
                          title={img.name}
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  {m.content.includes("[EVA_ACTION]") ? (
                    <div className="flex flex-col gap-1.5 py-1">
                      <div className="flex items-center gap-2 text-ds-text-secondary-light dark:text-ds-text-secondary italic text-xs opacity-90">
                        <Settings className="w-3.5 h-3.5 animate-pulse text-ds-accent-neon" />
                        <span>⚙️ Instrução técnica gerada e enviada para a extensão.</span>
                      </div>
                      {/* Conteúdo oculto para que a extensão ainda possa ler do DOM se necessário */}
                      <div className="hidden" data-technical-prompt="true">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <ChatCodeBlock
                      content={m.content}
                      onImplement={handleImplement}
                      onImplementAll={handleImplementAll}
                      className="text-ds-text-primary-light dark:text-ds-text-primary"
                      buttonLabel={m.isAutocura ? "Aplicar Autocura" : "Implementar Mudanças"}
                    />
                  )}
                </>
              )}
            </div>
            <div
              className={`flex items-center gap-1.5 py-0.5 ${m.role === "user" ? "justify-end" : "justify-start"
                }`}
            >
              <button
                type="button"
                onClick={() => {
                  setInput(messages[i].content);
                  setMessages((prev) => prev.filter((_, idx) => idx !== i));
                }}
                className="rounded p-0.5 text-zinc-400 hover:text-zinc-200 hover:bg-vscode-sidebar-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon"
                title="Editar mensagem (volta para o campo de texto)"
                aria-label="Editar mensagem"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMessages((prev) => prev.filter((_, idx) => idx !== i))}
                className="rounded p-0.5 text-ds-text-secondary-light dark:text-ds-text-secondary hover:text-red-500 hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon"
                title="Apagar da conversa"
                aria-label="Apagar mensagem"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {lastIsTruncated && (
          <div className="rounded-md px-2 py-2 bg-amber-900/30 border border-amber-600/50 text-amber-200 text-xs mr-4">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" aria-hidden />
              <span className="font-medium">Resposta truncada. A IA atingiu o limite de tokens. Clique em Continuar para completar o código antes de avançar.</span>
            </div>
            <button
              type="button"
              onClick={handleContinueGenerating}
              disabled={loadingContinue || loading}
              className="flex items-center justify-center gap-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white px-2 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Continuar geração da resposta"
            >
              {loadingContinue ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : null}
              Continuar Gerando
            </button>
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-1.5 text-ds-text-primary-light dark:text-ds-text-primary text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            Escrevendo...
          </div>
        )}
      </div>

      <div className="p-2 border-t border-ds-border-light dark:border-ds-border shrink-0 space-y-2">
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={loading}
          loading={loading}
          images={pendingImages}
          onImagesChange={setPendingImages}
          placeholder="Mensagem para o Analista..."
          showStopButton={loading || loadingContinue}
          onStop={handleStopGenerating}
        />
      </div>

      {pendingReviewActions && (
        <ImplementationReview
          actions={pendingReviewActions}
          onConfirm={async () => {
            const actionsToExecute = pendingReviewActions;
            const content = actionsToExecute.map(a => {
              if (a.action === 'CREATE_FILE') return `[EVA_ACTION] CREATE_FILE path="${a.path}"\n${a.content}\n[/EVA_ACTION]`;
              if (a.action === 'PATCH_FILE') return `[EVA_ACTION] PATCH_FILE path="${a.path}" search="${a.search}" replace="${a.replace}" [/EVA_ACTION]`;
              if (a.action === 'CREATE_DIRECTORY') return `[EVA_ACTION] CREATE_DIRECTORY path="${a.path}" [/EVA_ACTION]`;
              if (a.action === 'MOVE_FILE') return `[EVA_ACTION] MOVE_FILE from="${a.from}" to="${a.to}" [/EVA_ACTION]`;
              if (a.action === 'RUN_COMMAND') return `[EVA_ACTION] RUN_COMMAND command="${a.command}" [/EVA_ACTION]`;
              return '';
            }).join('\n');

            setPendingReviewActions(null);
            await executeEvaActions(content);
            await refreshFileTree();
          }}
          onCancel={() => setPendingReviewActions(null)}
        />
      )}
    </div >
  );
}
