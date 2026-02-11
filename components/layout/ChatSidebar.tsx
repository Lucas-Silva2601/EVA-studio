"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MessageCircle, Send, Loader2, AlertTriangle, Play, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { ChatInput, type ChatInputImage } from "@/components/layout/ChatInput";
import { useIdeState } from "@/hooks/useIdeState";
import { chatWithAnalyst, chatToChecklistTasks, getPromptForGemini, getCreatePlanPrompt, suggestFilename, type ChatProvider } from "@/lib/groq";
import { getProjectContext } from "@/lib/contextPacker";
import { getPhaseTaskLines, getFirstPendingTaskLine, getTasksByStatus, determinePhaseFromTask, getCurrentPhaseFromChecklist, getPhaseOfFirstPendingTask } from "@/lib/checklistPhase";
import { waitForCodeFromExtension, sendPromptToExtension, FILENAME_ASK_GROQ } from "@/lib/messaging";
import { getChatMessages, saveChatMessages } from "@/lib/indexedDB";
import { ChatCodeBlock } from "@/components/layout/ChatCodeBlock";
import { fixTxtFilenameIfCode } from "@/lib/utils";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** true quando a resposta foi cortada por limite de tokens (finish_reason === 'length' ou bloco de código aberto). */
  isTruncated?: boolean;
  /** true quando a mensagem é sugestão de autocura após erro de execução (botão "Aplicar Autocura"). */
  isAutocura?: boolean;
};

/** Extrai apenas o título da tarefa (antes de ":"), sem descrições longas que podem conter exemplos de código. */
function cleanTaskTitle(line: string): string {
  const desc = line.replace(/^\s*[-–—−]\s*\[\s*[ x]\s*\]\s*/i, "").trim();
  return desc.split(/:/)[0].trim() || desc;
}

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
    loopAutoRunning,
    setLoopAutoRunning,
    currentPhaseLines,
    setCurrentPhaseLines,
    extensionOnline,
    phaseBuffer,
    phaseBufferPhaseLines,
    setPhaseBuffer,
    setPhaseBufferPhaseLines,
    implementPhaseFromBuffer,
    geminiFlowStatus,
    setGeminiFlowStatus,
    isProcessing,
    executeEvaActions,
    recordLastSentTask,
    canSendTask,
    getLastSentTaskLine,
    onChecklistUpdated,
    chatProvider,
    setChatProvider,
    createFileWithContent,
    refreshFileTree,
  } = useIdeState();

  const projectId = folderName ?? "Projeto não aberto";
  const projectIdForStorage = folderName ?? "default";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingContinue, setLoadingContinue] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [progress, setProgress] = useState<{ totalPending: number; completedCount: number } | null>(null);
  const [pendingImages, setPendingImages] = useState<ChatInputImage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoAdvanceDoneRef = useRef(false);

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

  /** Determina a fase real: prioriza getCurrentPhaseFromChecklist para nunca enviar valor estático à API. */
  const resolvePhase = useCallback((taskLineOrDesc: string, content: string): number => {
    if (!content?.trim()) return 1;
    const fromChecklist = getCurrentPhaseFromChecklist(content);
    const fromTask = determinePhaseFromTask(taskLineOrDesc, content);
    return fromChecklist >= 1 ? Math.max(fromChecklist, fromTask) : fromTask;
  }, []);

  const handleContinueGenerating = useCallback(async () => {
    if (!lastIsTruncated || loadingContinue || loading) return;
    const lastAssistant = lastMessage?.role === "assistant" ? lastMessage : null;
    if (!lastAssistant) return;
    setLoadingContinue(true);
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
        provider: chatProvider,
        messages: historyWithContinuation,
        projectId,
        projectContext: projectContext || undefined,
        openFileContext,
        checklistContext: checklistContext || undefined,
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
      const taskDesc = extractTaskFromGroqReply(mergedContent);
      if (taskDesc && extensionOnline && directoryHandle) {
        setGeminiFlowStatus("awaiting_gemini");
        try {
          const lastUserContent = [...messages].reverse().find((m) => m.role === "user")?.content;
          const checklistCtx = checklistContext || (await getChecklistContentForContext());
          const explicitPhase = parseExplicitPhaseFromUserMessage(typeof lastUserContent === "string" ? lastUserContent : undefined);
          const phaseNum = explicitPhase ?? getPhaseOfFirstPendingTask(checklistCtx) ?? resolvePhase(taskDesc, checklistCtx);
          const allPhaseLines = getPhaseTaskLines(checklistCtx, phaseNum);
          const statusByPhase = getTasksByStatus(checklistCtx);
          const phaseStatus = statusByPhase[phaseNum];
          const pendingLines = phaseStatus?.pending ?? allPhaseLines.filter((l) => /^\s*[-–—−]\s*\[\s*\]\s*/.test(l));
          const taskDescriptions = pendingLines.map((l) => l.replace(/^\s*[-–—−]\s*\[\s*[ x]\s*\]\s*/i, "").trim());
          addOutputMessage({ type: "info", text: `Resposta completada. Enviando ${taskDescriptions.length} subtópico(s) da Fase ${phaseNum} ao Gemini.` });
          const prompt = await getPromptForGemini({
            phaseNumber: phaseNum,
            taskDescription: taskDescriptions[0] ?? taskDesc,
            taskDescriptions: taskDescriptions.length >= 1 ? taskDescriptions : undefined,
            projectContext: directoryHandle && fileTree.length > 0 ? await getProjectContext(directoryHandle, fileTree) : null,
            projectDescription: folderName ? folderName : undefined,
          });
          const result = await waitForCodeFromExtension(
            prompt.trim(),
            120000,
            () => addOutputMessage({ type: "warning", text: "Extensão EVA Bridge não detectada." })
          );
          if (result.ok) {
            setGeminiFlowStatus("code_received");
            let files = result.files ?? (result.filename ? [{ name: result.filename, content: result.code ?? "" }] : []);
            if (files.some((f) => f.name === FILENAME_ASK_GROQ)) {
              addOutputMessage({ type: "info", text: "Nome do arquivo não encontrado. Perguntando ao Analista..." });
              const resolved = await Promise.all(
                files.map(async (f) =>
                  f.name === FILENAME_ASK_GROQ
                    ? { name: await suggestFilename(f.content), content: f.content }
                    : f
                )
              );
              files = resolved;
            }
            if (files.length > 0) {
              const fixed = files.map((f) => ({
                filePath: fixTxtFilenameIfCode(f.name, f.content),
                proposedContent: f.content,
              }));
              proposeChangesFromChat(fixed, { phaseLines: pendingLines.length > 0 ? allPhaseLines : undefined });
              addOutputMessage({ type: "success", text: "Código recebido do Gemini. Revise e clique em Implementar." });
              getChecklistProgress().then(setProgress);
            } else {
              addOutputMessage({ type: "warning", text: "A extensão respondeu, mas nenhum código foi capturado. Recarregue a aba do Gemini (F5), espere a resposta terminar por completo e tente de novo." });
            }
          } else {
            setGeminiFlowStatus(null);
            addOutputMessage({ type: "error", text: result.error ?? "Erro ao receber código do Gemini." });
          }
        } catch (geminiErr) {
          setGeminiFlowStatus(null);
          addOutputMessage({ type: "error", text: geminiErr instanceof Error ? geminiErr.message : "Erro ao enviar ao Gemini." });
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro ao continuar.";
      addOutputMessage({ type: "error", text: errorMsg });
    } finally {
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
    chatProvider,
    extensionOnline,
    getChecklistContentForContext,
    getPhaseOfFirstPendingTask,
    resolvePhase,
    getPhaseTaskLines,
    getTasksByStatus,
    getPromptForGemini,
    waitForCodeFromExtension,
    suggestFilename,
    proposeChangesFromChat,
    fixTxtFilenameIfCode,
    getChecklistProgress,
    setProgress,
    setGeminiFlowStatus,
    folderName,
    executeEvaActions,
  ]);

  /** Extrai número da fase quando o usuário menciona explicitamente (ex.: "implementar fase 1", "fase 2"). */
  const parseExplicitPhaseFromUserMessage = (content: string | undefined): number | null => {
    if (!content?.trim()) return null;
    const lower = content.trim().toLowerCase();
    const match = lower.match(/(?:implementar|fazer|executar|rodar|ir\s+para)?\s*fase\s*(\d+)/i)
      || lower.match(/phase\s*(\d+)/i)
      || lower.match(/fase\s*(\d+)/i);
    if (match?.[1]) {
      const n = parseInt(match[1], 10);
      return n >= 1 ? n : null;
    }
    return null;
  };

  /** Extrai a descrição da tarefa quando o Groq responde "Enviando tarefa '...' para o Gemini". */
  const extractTaskFromGroqReply = (content: string): string | null => {
    const single = /Enviando tarefa\s+'([^']*)'\s+para o Gemini/i.exec(content);
    if (single?.[1]) return single[1].trim();
    const double = /Enviando tarefa\s+"([^"]*)"\s+para o Gemini/i.exec(content);
    if (double?.[1]) return double[1].trim();
    const alt = /Tarefa\s+['"]([^'"]*)['"]\s+enviada ao Gemini/i.exec(content);
    if (alt?.[1]) return alt[1].trim();
    return null;
  };

  const handleSend = async (imgs: ChatInputImage[] = []) => {
    const text = input.trim();
    if ((!text && imgs.length === 0) || loading) return;
    if (imgs.length > 0 && chatProvider === "groq") {
      addOutputMessage({ type: "warning", text: "Imagens exigem Gemini. Alternando para Gemini automaticamente." });
      setChatProvider("gemini");
    }
    const effectiveProvider = imgs.length > 0 ? "gemini" : chatProvider;
    setInput("");
    setPendingImages([]);
    const userMsg: ChatMessage = { role: "user", content: text || "[Imagem anexada]" };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

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
        provider: effectiveProvider,
        messages: history,
        images: imgs.length > 0 ? imgs.map((i) => ({ base64: i.base64, mimeType: i.mimeType })) : undefined,
        projectId,
        projectContext: projectContext || undefined,
        openFileContext,
        checklistContext: checklistContext || undefined,
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply.content, isTruncated: reply.isTruncated },
      ]);
      executeEvaActions(reply.content);

      const criarPlanoMatch = reply.content.match(/CRIAR_PLANO:\s*(.+?)(?:\n|$)/i);
      if (criarPlanoMatch && extensionOnline && directoryHandle) {
        const userRequest = criarPlanoMatch[1].trim().slice(0, 200);
        setGeminiFlowStatus("awaiting_gemini");
        try {
          addOutputMessage({ type: "info", text: "Criando plano em fases na pasta docs/. Enviando ao Gemini..." });
          const prompt = await getCreatePlanPrompt({
            userRequest,
            projectDescription: folderName ?? undefined,
          });
          const result = await waitForCodeFromExtension(
            prompt.trim(),
            120000,
            () => addOutputMessage({ type: "warning", text: "Extensão EVA Bridge não detectada." })
          );
          if (result.ok) {
            const files = result.files ?? (result.filename ? [{ name: result.filename, content: result.code ?? "" }] : []);
            const normalized = files.map((f) => ({
              ...f,
              path: (() => {
                const n = f.name.replace(/\\/g, "/").trim();
                if (n.startsWith("docs/")) return n;
                if (/^fase-\d+\.md$/i.test(n)) return "docs/" + n;
                return n;
              })(),
            }));
            const docsFiles = normalized.filter((f) => f.path.startsWith("docs/"));
            if (docsFiles.length > 0) {
              for (const f of docsFiles) {
                await createFileWithContent(f.path, f.content);
              }
              await refreshFileTree();
              setGeminiFlowStatus("code_received");
              addOutputMessage({ type: "success", text: `Plano criado: ${docsFiles.length} arquivo(s) em docs/. Use os botões de Fase para implementar.` });
              getChecklistProgress().then(setProgress);
            } else {
              setGeminiFlowStatus(null);
              addOutputMessage({ type: "warning", text: "Nenhum arquivo docs/fase-*.md recebido. Recarregue a aba do Gemini (F5) e tente novamente." });
            }
          } else {
            setGeminiFlowStatus(null);
            addOutputMessage({ type: "error", text: result.error ?? "Erro ao receber plano do Gemini." });
          }
        } catch (err) {
          setGeminiFlowStatus(null);
          addOutputMessage({ type: "error", text: err instanceof Error ? err.message : "Erro ao criar plano." });
        }
        setLoading(false);
        return;
      }

      const taskDesc = extractTaskFromGroqReply(reply.content);
      if (taskDesc && extensionOnline && directoryHandle) {
        setGeminiFlowStatus("awaiting_gemini");
        try {
          const checklistCtx = checklistContext || (await getChecklistContentForContext());
          const explicitPhase = parseExplicitPhaseFromUserMessage(text);
          const phaseNum = explicitPhase ?? getCurrentPhaseFromChecklist(checklistCtx) ?? resolvePhase(taskDesc, checklistCtx);
          const allPhaseLines = getPhaseTaskLines(checklistCtx, phaseNum);
          const statusByPhase = getTasksByStatus(checklistCtx);
          const phaseStatus = statusByPhase[phaseNum];
          const pendingLines = phaseStatus?.pending ?? allPhaseLines.filter((l) => /^\s*[-–—−]\s*\[\s*\]\s*/.test(l));
          const taskDescriptions = pendingLines.map((l) => l.replace(/^\s*[-–—−]\s*\[\s*[ x]\s*\]\s*/i, "").trim());
          addOutputMessage({ type: "info", text: `Enviando ${taskDescriptions.length} subtópico(s) da Fase ${phaseNum} ao Gemini em um único prompt.` });
          const prompt = await getPromptForGemini({
            phaseNumber: phaseNum,
            taskDescription: taskDescriptions[0] ?? taskDesc,
            taskDescriptions: taskDescriptions.length >= 1 ? taskDescriptions : undefined,
            projectContext: directoryHandle && fileTree.length > 0 ? await getProjectContext(directoryHandle, fileTree) : null,
            projectDescription: folderName ? folderName : undefined,
          });
          const result = await waitForCodeFromExtension(
            prompt.trim(),
            120000,
            () => addOutputMessage({ type: "warning", text: "Extensão EVA Bridge não detectada." })
          );
          if (result.ok) {
            setGeminiFlowStatus("code_received");
            let files = result.files ?? (result.filename ? [{ name: result.filename, content: result.code ?? "" }] : []);
            if (files.some((f) => f.name === FILENAME_ASK_GROQ)) {
              addOutputMessage({ type: "info", text: "Nome do arquivo não encontrado. Perguntando ao Analista..." });
              const resolved = await Promise.all(
                files.map(async (f) =>
                  f.name === FILENAME_ASK_GROQ
                    ? { name: await suggestFilename(f.content), content: f.content }
                    : f
                )
              );
              files = resolved;
            }
            if (files.length > 0) {
              const fixed = files.map((f) => ({
                filePath: fixTxtFilenameIfCode(f.name, f.content),
                proposedContent: f.content,
              }));
              proposeChangesFromChat(fixed, { phaseLines: pendingLines.length > 0 ? allPhaseLines : undefined });
              addOutputMessage({ type: "success", text: "Código recebido do Gemini. Revise e clique em Implementar." });
              getChecklistProgress().then(setProgress);
            } else {
              addOutputMessage({ type: "warning", text: "A extensão respondeu, mas nenhum código foi capturado. Recarregue a aba do Gemini (F5), espere a resposta terminar por completo e tente de novo." });
            }
          } else {
            setGeminiFlowStatus(null);
            addOutputMessage({ type: "error", text: result.error ?? "Erro ao receber código do Gemini." });
          }
        } catch (geminiErr) {
          setGeminiFlowStatus(null);
          addOutputMessage({ type: "error", text: (geminiErr instanceof Error ? geminiErr.message : "Erro ao enviar ao Gemini.") });
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro ao enviar mensagem.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Erro: ${errorMsg}` },
      ]);
      addOutputMessage({ type: "error", text: errorMsg });
    } finally {
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
        text: "Tarefas adicionadas ao checklist. Use o botão da Fase correspondente (Gemini) para implementar.",
      });
      if (extensionOnline && nextTask) {
        const phaseNum = resolvePhase(nextTask.taskLine, newContent);
        const prompt = await getPromptForGemini({
          phaseNumber: phaseNum,
          taskDescription: nextTask.taskDescription,
          projectContext: directoryHandle && fileTree.length > 0 ? await getProjectContext(directoryHandle, fileTree) : null,
          projectDescription: folderName ? folderName : undefined,
        });
        sendPromptToExtension(prompt.trim());
        addOutputMessage({ type: "info", text: "Prompt enviado ao Gemini. Cole na aba do Gemini se não abrir automaticamente." });
      }
    } catch (err) {
      addOutputMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao traduzir em tarefas.",
      });
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleAdvanceToNext = useCallback(async () => {
    if (isProcessing || !nextPendingTask || loading || !directoryHandle || !extensionOnline) return;
    try {
      const checklistContent = await readChecklist();
      const targetPhase = getPhaseOfFirstPendingTask(checklistContent);
      const allPhaseLines = getPhaseTaskLines(checklistContent, targetPhase);
      const statusByPhase = getTasksByStatus(checklistContent);
      const phaseStatus = statusByPhase[targetPhase];
      const pendingLines = phaseStatus?.pending ?? allPhaseLines.filter((l) => /^\s*[-–—−]\s*\[\s*\]\s*/.test(l));
      if (pendingLines.length === 0) {
        setNextPendingTask(null);
        if (loopAutoRunning) setLoopAutoRunning(false);
        return;
      }
      const firstPending = pendingLines[0]?.trim();
      if (!canSendTask(firstPending ?? "")) {
        addOutputMessage({
          type: "error",
          text: "Progresso bloqueado: esta tarefa já foi enviada. Aceite ou rejeite as alterações no diff ou marque [x] no checklist.",
        });
        return;
      }
      recordLastSentTask(firstPending ?? "");
    } catch {
      // readChecklist falhou; segue mesmo assim
    }
    setNextPendingTask(null);
    setLoading(true);
    setGeminiFlowStatus("awaiting_gemini");
    try {
      const checklistContent = await readChecklist();
      const targetPhase = getPhaseOfFirstPendingTask(checklistContent);
      const allPhaseLines = getPhaseTaskLines(checklistContent, targetPhase);
      const statusByPhase = getTasksByStatus(checklistContent);
      const phaseStatus = statusByPhase[targetPhase];
      const pendingLines = phaseStatus?.pending ?? allPhaseLines.filter((l) => /^\s*[-–—−]\s*\[\s*\]\s*/.test(l));
      const taskDescriptions = pendingLines.map(cleanTaskTitle);
      setCurrentPhaseLines(allPhaseLines);
      const prompt = await getPromptForGemini({
        phaseNumber: targetPhase,
        taskDescription: taskDescriptions[0] ?? "",
        taskDescriptions: taskDescriptions.length >= 1 ? taskDescriptions : undefined,
        projectContext: directoryHandle && fileTree.length > 0 ? await getProjectContext(directoryHandle, fileTree) : null,
        projectDescription: folderName ? folderName : undefined,
      });
      const result = await waitForCodeFromExtension(
        prompt.trim(),
        180000,
        () => addOutputMessage({ type: "warning", text: "Extensão EVA Bridge não detectada." })
      );
      if (!result.ok) {
        setGeminiFlowStatus(null);
        addOutputMessage({ type: "error", text: result.error ?? "Erro ao receber código do Gemini." });
        setNextPendingTask(nextPendingTask);
        return;
      }
      setGeminiFlowStatus("code_received");
      let files = result.files ?? (result.filename ? [{ name: result.filename, content: result.code ?? "" }] : []);
      if (files.some((f) => f.name === FILENAME_ASK_GROQ)) {
        addOutputMessage({ type: "info", text: "Nome do arquivo não encontrado na resposta. Perguntando ao Analista..." });
        const resolved = await Promise.all(
          files.map(async (f) =>
            f.name === FILENAME_ASK_GROQ
              ? { name: await suggestFilename(f.content), content: f.content }
              : f
          )
        );
        files = resolved;
      }
      if (files.length > 0) {
        const fixed = files.map((f) => ({
          filePath: fixTxtFilenameIfCode(f.name, f.content),
          proposedContent: f.content,
        }));
        const checklistContent2 = await readChecklist();
        const phaseNum2 = getPhaseOfFirstPendingTask(checklistContent2);
        const allPhaseLines2 = getPhaseTaskLines(checklistContent2, phaseNum2);
        proposeChangesFromChat(fixed, { phaseLines: allPhaseLines2 });
      } else {
        addOutputMessage({ type: "warning", text: "A extensão respondeu, mas nenhum código foi capturado. Recarregue a aba do Gemini (F5), espere a resposta terminar por completo e tente de novo." });
      }
      getChecklistProgress().then(setProgress);
    } catch (err) {
      setGeminiFlowStatus(null);
      addOutputMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao avançar para próxima tarefa.",
      });
      setNextPendingTask(nextPendingTask);
    } finally {
      setLoading(false);
    }
  }, [
    isProcessing,
    nextPendingTask,
    loading,
    directoryHandle,
    fileTree,
    folderName,
    extensionOnline,
    readChecklist,
    canSendTask,
    recordLastSentTask,
    setNextPendingTask,
    setCurrentPhaseLines,
    setLoopAutoRunning,
    loopAutoRunning,
    getCurrentPhaseFromChecklist,
    getPhaseTaskLines,
    getTasksByStatus,
    setGeminiFlowStatus,
    proposeChangesFromChat,
    getChecklistProgress,
    addOutputMessage,
  ]);

  useEffect(() => {
    if (!nextPendingTask || !loopAutoRunning || loading || lastIsTruncated) return;
    if (autoAdvanceDoneRef.current) return;
    autoAdvanceDoneRef.current = true;
    handleAdvanceToNext().finally(() => {
      autoAdvanceDoneRef.current = false;
    });
  }, [nextPendingTask, loopAutoRunning, loading, lastIsTruncated, handleAdvanceToNext]);

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
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${extensionOnline ? "text-red-200 bg-red-900/40 dark:text-red-300 dark:bg-red-900/35" : "text-zinc-500 bg-zinc-800/50 dark:text-zinc-400 dark:bg-zinc-800/40"}`}
          title={extensionOnline ? "Extensão EVA Bridge conectada (Gemini)" : "Extensão offline. Instale a EVA Bridge e abra gemini.google.com."}
        >
          {extensionOnline ? "Online" : "Offline"}
        </span>
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
            Converse com o Analista ({chatProvider === "gemini" ? "Gemini" : "Groq"}). Projeto: <strong>{projectId}</strong>. Implementação é feita pelo Gemini (botão Fase N ou extensão).
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
                <div className="whitespace-pre-wrap text-ds-text-primary-light dark:text-ds-text-primary">{m.content}</div>
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
        {geminiFlowStatus && (
          <div
            className="rounded-md px-2 py-1.5 text-xs font-medium mr-4 border border-ds-border-light dark:border-ds-border"
            role="status"
            aria-live="polite"
            style={{
              backgroundColor:
                geminiFlowStatus === "awaiting_gemini"
                  ? "rgba(59, 130, 246, 0.2)"
                  : geminiFlowStatus === "code_received"
                    ? "rgba(34, 197, 94, 0.2)"
                    : "rgba(34, 197, 94, 0.3)",
              color:
                geminiFlowStatus === "awaiting_gemini"
                  ? "rgb(147, 197, 253)"
                  : "rgb(134, 239, 172)",
            }}
          >
            {geminiFlowStatus === "awaiting_gemini" && "Aguardando Gemini…"}
            {geminiFlowStatus === "code_received" && "Código Recebido"}
            {geminiFlowStatus === "implemented" && "Implementado"}
          </div>
        )}
      </div>

      <div className="p-2 border-t border-ds-border-light dark:border-ds-border shrink-0 space-y-2">
        {phaseBuffer.length > 0 && phaseBufferPhaseLines != null && (
          <div className="rounded-md px-2 py-2 bg-red-900/20 dark:bg-red-900/20 border border-red-600/40 dark:border-red-600/40 text-ds-text-primary-light dark:text-ds-text-primary text-xs">
            <p className="font-medium mb-1">Fase concluída pelo Gemini ({phaseBuffer.length} arquivo(s))</p>
            <button
              type="button"
              onClick={() => implementPhaseFromBuffer()}
              className="w-full flex items-center justify-center gap-1.5 rounded bg-ds-accent-light dark:bg-ds-accent-neon hover:bg-ds-accent-light-hover dark:hover:bg-ds-accent-neon-hover text-white dark:text-gray-900 px-2 py-1.5 text-xs font-medium shadow-[var(--ds-glow-neon)] focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon"
              aria-label="Implementar Fase (abrir Diff e salvar)"
            >
              <Play className="w-3.5 h-3.5" aria-hidden />
              Implementar Fase
            </button>
          </div>
        )}
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={loading}
          loading={loading}
          chatProvider={chatProvider}
          onChatProviderChange={setChatProvider}
          images={pendingImages}
          onImagesChange={setPendingImages}
          placeholder="Mensagem para o Analista..."
        />
      </div>
    </div>
  );
}
