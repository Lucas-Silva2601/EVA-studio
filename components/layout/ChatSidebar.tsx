"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MessageCircle, Loader2, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { ChatInput, type ChatInputImage } from "@/components/layout/ChatInput";
import { useIdeState } from "@/hooks/useIdeState";
import { chatWithAnalyst, chatToChecklistTasks } from "@/lib/groq";
import { getProjectContext } from "@/lib/contextPacker";
import { getChatMessages, saveChatMessages } from "@/lib/indexedDB";
import { ChatCodeBlock } from "@/components/layout/ChatCodeBlock";
import { waitForCodeFromExtension, FILENAME_ASK_GROQ } from "@/lib/messaging";
import {
  buildPromptForGemini,
  buildPromptForGeminiPhase,
  buildProjectPlanPrompt,
  extractPromptFromAssistantMessage,
  getRequestedPhaseNumber,
  isProjectCreationRequest,
} from "@/lib/geminiPrompt";
import { ensureChecklistItemsUnchecked, mergeChecklistPhasePreservingCompleted } from "@/lib/checklistPhase";

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
    proposeChangeFromChat,
    proposeChangesFromChat,
    pendingAutocura,
    setPendingAutocura,
    setGenesisQueue,
    setCurrentChecklistTask,
    nextPendingTask,
    setNextPendingTask,
    getChecklistProgress,
    getNextTaskFromContent,
    getTasksForPhase,
    loopAutoRunning,
    setLoopAutoRunning,
    currentPhaseLines,
    setCurrentPhaseLines,
    executeEvaActions,
    onChecklistUpdated,
    createFileWithContent,
    refreshFileTree,
    readFileContent,
  } = useIdeState();

  const projectId = folderName ?? "Projeto não aberto";
  const projectIdForStorage = folderName ?? "default";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingContinue, setLoadingContinue] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingGemini, setLoadingGemini] = useState(false);
  const [progress, setProgress] = useState<{ totalPending: number; completedCount: number } | null>(null);
  const [pendingImages, setPendingImages] = useState<ChatInputImage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /** Envia prompt ao Gemini via extensão; ao receber código, abre o diff e opcionalmente adiciona mensagem no chat (repassar ao Groq). */
  const sendTaskToGemini = useCallback(
    async (
      prompt: string,
      task?: { taskLine: string; taskDescription: string },
      phaseLines?: string[]
    ) => {
      if (!directoryHandle || !prompt.trim()) return;
      setLoadingGemini(true);
      addOutputMessage({ type: "info", text: "Enviando tarefa ao Gemini (extensão). Aguarde..." });
      if (task) setCurrentChecklistTask(task);
      try {
        const result = await waitForCodeFromExtension(
          prompt,
          120000,
          () => addOutputMessage({ type: "warning", text: "Extensão não detectada. Instale a EVA Studio Bridge e abra uma aba em gemini.google.com." })
        );
        if (!result.ok) {
          addOutputMessage({ type: "error", text: result.error ?? "Erro ao receber código do Gemini." });
          setLoadingGemini(false);
          return;
        }
        const files = result.files ?? (result.filename || result.code ? [{ name: result.filename ?? "file.txt", content: result.code }] : []);
        const validFiles = files.filter((f) => f.name !== FILENAME_ASK_GROQ);
        if (validFiles.length === 0) {
          addOutputMessage({
            type: "warning",
            text: "Nenhum arquivo válido recebido do Gemini. Se o nome do arquivo não foi detectado, pergunte ao Analista (Groq) o nome antes de salvar.",
          });
          setLoadingGemini(false);
          return;
        }
        const isChecklistPhaseFile = (path: string) => /^docs\/fase-\d+\.md$/i.test(path.replace(/\\/g, "/"));
        const normalizedFiles = validFiles.map((f) => {
          const pathNorm = f.name.replace(/\\/g, "/");
          const content = isChecklistPhaseFile(pathNorm) ? ensureChecklistItemsUnchecked(f.content) : f.content;
          return { filePath: pathNorm, proposedContent: content };
        });
        const allChecklistPhases = normalizedFiles.length > 0 && normalizedFiles.every((f) => isChecklistPhaseFile(f.filePath));
        if (allChecklistPhases) {
          for (const f of normalizedFiles) {
            try {
              let contentToSave = f.proposedContent;
              try {
                const currentOnDisk = await readFileContent(f.filePath);
                contentToSave = mergeChecklistPhasePreservingCompleted(currentOnDisk, f.proposedContent);
              } catch {
                /* arquivo novo: usa conteúdo proposto (já com [ ]) */
              }
              await createFileWithContent(f.filePath, contentToSave);
            } catch (err) {
              addOutputMessage({ type: "error", text: `Erro ao salvar ${f.filePath}: ${(err as Error).message}` });
            }
          }
          const fileList = normalizedFiles.map((f) => f.filePath).join(", ");
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `**Checklist em fases criado automaticamente:** ${fileList}. Os arquivos já estão no projeto em **docs/**.`,
            },
          ]);
          addOutputMessage({ type: "success", text: `Checklist inserido no projeto (${normalizedFiles.length} arquivo(s) em docs/).` });
          refreshFileTree().then(() => getChecklistProgress().then(setProgress));
        } else {
          const codeFilesOnly = normalizedFiles.filter((f) => !isChecklistPhaseFile(f.filePath));
          proposeChangesFromChat(codeFilesOnly.length > 0 ? codeFilesOnly : normalizedFiles, {
            phaseLines: phaseLines ?? (task ? [task.taskLine] : undefined),
          });
          const fileList = (codeFilesOnly.length > 0 ? codeFilesOnly : normalizedFiles).map((f) => f.filePath).join(", ");
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `**O Gemini concluiu a tarefa e gerou os arquivos:** ${fileList}. Revise as alterações no diff e aceite para salvar no projeto.`,
            },
          ]);
          addOutputMessage({ type: "success", text: `Código recebido do Gemini (${validFiles.length} arquivo(s)). Revise o diff.` });
        }
      } catch (err) {
        addOutputMessage({ type: "error", text: `Erro ao enviar/receber do Gemini: ${(err as Error).message}` });
      } finally {
        setLoadingGemini(false);
      }
    },
    [
      directoryHandle,
      addOutputMessage,
      setCurrentChecklistTask,
      proposeChangesFromChat,
      createFileWithContent,
      refreshFileTree,
      getChecklistProgress,
      readFileContent,
    ]
  );

  /** Envia automaticamente a próxima tarefa do checklist ao Gemini (quando não há prompt explícito na resposta do Groq). */
  const sendNextTaskToGeminiIfAny = useCallback(async () => {
    if (!directoryHandle) return;
    try {
      const openChecklist = activeFilePath === "checklist.md" ? openFiles.find((f) => f.path === "checklist.md") : null;
      const checklistContent = openChecklist ? openChecklist.content : await readChecklist();
      const nextTask = await getNextTaskFromContent(checklistContent);
      if (!nextTask) return;
      const projectContext =
        fileTree.length > 0 ? await getProjectContext(directoryHandle, fileTree) : "";
      const prompt = buildPromptForGemini(nextTask.taskDescription, {
        taskLine: nextTask.taskLine,
        projectContext: projectContext || undefined,
      });
      await sendTaskToGemini(prompt, nextTask, [nextTask.taskLine]);
    } catch {
      // Silencioso: não interrompe o fluxo do chat
    }
  }, [
    directoryHandle,
    activeFilePath,
    openFiles,
    readChecklist,
    getNextTaskFromContent,
    fileTree,
    getProjectContext,
    sendTaskToGemini,
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

  useEffect(() => {
    if (!pendingAutocura) return;
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: pendingAutocura.content, isAutocura: true },
    ]);
    setPendingAutocura(null);
  }, [pendingAutocura, setPendingAutocura]);

  const getChecklistContentForContext = async (): Promise<string> => {
    if (activeFile?.path === "checklist.md") return activeFile.content;
    if (!directoryHandle) return "";
    try {
      return await readChecklist();
    } catch {
      return "";
    }
  };

  const handleImplement = useCallback(
    (filePath: string, proposedContent: string) => {
      setCurrentPhaseLines(null);
      proposeChangeFromChat(filePath, proposedContent);
    },
    [proposeChangeFromChat, setCurrentPhaseLines]
  );

  const handleImplementAll = useCallback(
    (files: { filePath: string; content: string }[]) => {
      proposeChangesFromChat(
        files.map((f) => ({ filePath: f.filePath, proposedContent: f.content })),
        { phaseLines: currentPhaseLines ?? undefined }
      );
    },
    [proposeChangesFromChat, currentPhaseLines]
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
      executeEvaActions(reply.content);
      const promptForGemini = extractPromptFromAssistantMessage(mergedContent);
      if (promptForGemini) {
        sendTaskToGemini(promptForGemini);
      } else {
        sendNextTaskToGeminiIfAny();
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
    sendTaskToGemini,
    sendNextTaskToGeminiIfAny,
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
      const history = [...messages, userMsg];
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
        messages: history,
        images: imgs.length > 0 ? imgs.map((i) => ({ base64: i.base64, mimeType: i.mimeType })) : undefined,
        projectId,
        projectContext: projectContext || undefined,
        openFileContext,
        checklistContext: checklistContext || undefined,
        signal: controller.signal,
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply.content, isTruncated: reply.isTruncated },
      ]);
      executeEvaActions(reply.content);
      const promptForGemini = extractPromptFromAssistantMessage(reply.content);
      const isFirstCommand = messages.length === 0;
      const wantsProjectCreation = isProjectCreationRequest(userMsg.content);
      const requestedPhase = getRequestedPhaseNumber(userMsg.content);
      if (promptForGemini) {
        sendTaskToGemini(promptForGemini);
      } else if (isFirstCommand && wantsProjectCreation) {
        if (!directoryHandle) {
          addOutputMessage({
            type: "warning",
            text: "Abra uma pasta do projeto (Abrir pasta) antes de criar o plano em fases. O checklist será salvo em docs/fase-1.md, docs/fase-2.md, etc.",
          });
        } else {
          sendTaskToGemini(buildProjectPlanPrompt(userMsg.content));
        }
      } else if (requestedPhase != null && directoryHandle) {
        const checklistContent = await getChecklistContentForContext();
        const phaseTasks = await getTasksForPhase(checklistContent ?? "", requestedPhase);
        if (phaseTasks.length > 0) {
          const prompt = buildPromptForGeminiPhase(phaseTasks);
          await sendTaskToGemini(prompt, undefined, phaseTasks.map((t) => t.taskLine));
        } else {
          addOutputMessage({
            type: "info",
            text: `Nenhuma tarefa pendente na Fase ${requestedPhase}. Todas já foram concluídas ou a fase não existe.`,
          });
          sendNextTaskToGeminiIfAny();
        }
      } else {
        sendNextTaskToGeminiIfAny();
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "_Resposta interrompida pelo usuário._" },
        ]);
        return;
      }
      const errorMsg = err instanceof Error ? err.message : "Erro ao enviar mensagem.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Erro: ${errorMsg}` },
      ]);
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
      setCurrentPhaseLines(null);
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
    if (nextPendingTask && directoryHandle) getChecklistProgress().then(setProgress);
    if (!nextPendingTask && !directoryHandle) setProgress(null);
  }, [nextPendingTask, directoryHandle, getChecklistProgress]);

  useEffect(() => {
    const unreg = onChecklistUpdated(() => getChecklistProgress().then(setProgress));
    return unreg;
  }, [onChecklistUpdated, getChecklistProgress]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-ds-surface-light dark:bg-ds-surface overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2 py-2 border-b border-ds-border-light dark:border-ds-border shrink-0">
        <h2 className="panel-title flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5" aria-hidden />
          Chat EVA
        </h2>
        {activeFile && (
          <span
            className="text-[10px] text-ds-text-secondary-light dark:text-ds-text-secondary truncate max-w-[100px]"
            title={activeFile.path}
          >
            {activeFile.name}
          </span>
        )}
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
              className={`rounded-md px-2 py-1.5 break-words border-l-2 ${
                m.role === "user"
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
                <ChatCodeBlock
                  content={m.content}
                  onImplement={handleImplement}
                  onImplementAll={handleImplementAll}
                  className="text-ds-text-primary-light dark:text-ds-text-primary"
                  buttonLabel={m.isAutocura ? "Aplicar Autocura" : "Implementar Mudanças"}
                />
              )}
            </div>
            <div
              className={`flex items-center gap-1.5 py-0.5 ${
                m.role === "user" ? "justify-end" : "justify-start"
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
    </div>
  );
}
