"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MessageCircle, Send, Loader2, ListTodo, AlertTriangle } from "lucide-react";
import { useIdeState } from "@/hooks/useIdeState";
import { chatWithAnalyst, chatToChecklistTasks } from "@/lib/groq";
import { getProjectContext } from "@/lib/contextPacker";
import { ChatCodeBlock } from "@/components/layout/ChatCodeBlock";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** true quando a resposta foi cortada por limite de tokens (finish_reason === 'length' ou bloco de código aberto). */
  isTruncated?: boolean;
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
    readChecklist,
    writeChecklist,
    addOutputMessage,
    proposeChangeFromChat,
  } = useIdeState();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingContinue, setLoadingContinue] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastIsTruncated = lastMessage?.role === "assistant" && lastMessage?.isTruncated === true;

  const activeFile = activeFilePath
    ? openFiles.find((f) => f.path === activeFilePath)
    : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

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
      proposeChangeFromChat(filePath, proposedContent);
    },
    [proposeChangeFromChat]
  );

  const CONTINUATION_PROMPT =
    "Sua resposta anterior foi cortada pelo limite de tokens. Por favor, continue a geração EXATAMENTE de onde você parou. Não repita o contexto inicial, apenas complete o código ou texto pendente.";

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
        messages: historyWithContinuation,
        projectContext: projectContext || undefined,
        openFileContext,
        checklistContext: checklistContext || undefined,
      });
      setMessages((prev) => {
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (lastIdx >= 0 && next[lastIdx].role === "assistant") {
          next[lastIdx] = {
            ...next[lastIdx],
            content: next[lastIdx].content + reply.content,
            isTruncated: reply.isTruncated,
          };
        }
        return next;
      });
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
    directoryHandle,
    fileTree,
    activeFile,
    addOutputMessage,
  ]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: text };
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
        messages: history,
        projectContext: projectContext || undefined,
        openFileContext,
        checklistContext: checklistContext || undefined,
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply.content, isTruncated: reply.isTruncated },
      ]);
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
      addOutputMessage({
        type: "success",
        text: "Tarefas adicionadas ao checklist.md. Propondo código da primeira tarefa pendente...",
      });
      const syntheticUserMsg: ChatMessage = {
        role: "user",
        content: "Implemente a primeira tarefa pendente do checklist. Use // FILE: no início de cada bloco de código.",
      };
      setMessages((prev) => [...prev, syntheticUserMsg]);
      const projectContext =
        directoryHandle && fileTree.length > 0
          ? await getProjectContext(directoryHandle, fileTree)
          : "";
      const openFileContext =
        activeFile != null
          ? { path: activeFile.path, content: activeFile.content }
          : null;
      const reply = await chatWithAnalyst({
        messages: [...messages, syntheticUserMsg],
        projectContext: projectContext || undefined,
        openFileContext,
        checklistContext: newContent,
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply.content, isTruncated: reply.isTruncated },
      ]);
      addOutputMessage({
        type: "success",
        text: "Código da primeira tarefa proposto. Use o botão \"Implementar Mudanças\" para aplicar.",
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

  return (
    <div className="flex flex-col h-full min-h-0 bg-vscode-sidebar">
      <div className="flex items-center justify-between gap-2 px-2 py-2 border-b border-vscode-border shrink-0">
        <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5" aria-hidden />
          Chat EVA
        </h2>
        {activeFile && (
          <span
            className="text-[10px] text-gray-600 truncate max-w-[100px]"
            title={activeFile.path}
          >
            {activeFile.name}
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2 space-y-2 text-sm"
        role="log"
        aria-live="polite"
        aria-label="Histórico do chat"
      >
        {messages.length === 0 && (
          <p className="text-zinc-50 text-xs py-2">
            Converse com o Engenheiro Chefe. O projeto inteiro e o arquivo aberto são enviados como contexto.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-md px-2 py-1.5 break-words ${
              m.role === "user"
                ? "bg-vscode-accent/20 text-zinc-50 ml-4"
                : "bg-vscode-bg/80 text-zinc-50 mr-4"
            }`}
          >
            <span className="text-[10px] font-medium text-zinc-300 block mb-0.5">
              {m.role === "user" ? "Você" : "Engenheiro Chefe"}
            </span>
            {m.role === "user" ? (
              <div className="whitespace-pre-wrap text-zinc-50">{m.content}</div>
            ) : (
              <ChatCodeBlock content={m.content} onImplement={handleImplement} className="text-zinc-50" />
            )}
          </div>
        ))}
        {lastIsTruncated && (
          <div className="rounded-md px-2 py-2 bg-amber-900/30 border border-amber-600/50 text-amber-200 text-xs mr-4">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" aria-hidden />
              <span className="font-medium">A IA atingiu o limite de tokens. Clique em Continuar para completar o código.</span>
            </div>
            <button
              type="button"
              onClick={handleContinueGenerating}
              disabled={loadingContinue || loading}
              className="flex items-center justify-center gap-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="flex items-center gap-1.5 text-zinc-50 text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            Escrevendo...
          </div>
        )}
      </div>

      <div className="p-2 border-t border-vscode-border shrink-0 space-y-2">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Mensagem para o Analista..."
            className="flex-1 min-w-0 rounded bg-vscode-input border border-vscode-border px-2 py-1.5 text-sm text-gray-600 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-vscode-accent"
            disabled={loading}
            aria-label="Mensagem do chat"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="shrink-0 rounded bg-vscode-accent text-white p-1.5 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Enviar mensagem"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={handleTranslateAndRun}
          disabled={loadingTasks || messages.length === 0 || !directoryHandle}
          className="w-full flex items-center justify-center gap-1.5 rounded bg-vscode-accent/80 text-gray-800 py-1.5 text-xs font-medium hover:bg-vscode-accent disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Traduzir última mensagem em tarefas e propor código da primeira"
        >
          {loadingTasks ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <ListTodo className="w-3.5 h-3.5" aria-hidden />
          )}
          Traduzir em tarefas e executar
        </button>
      </div>
    </div>
  );
}
