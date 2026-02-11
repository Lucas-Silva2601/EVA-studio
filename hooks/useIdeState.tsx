"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type {
  FileNode,
  OpenFile,
  OutputMessage,
  ValidationResult,
  LoopStatus,
  PendingDiffReview,
} from "@/types";
import {
  listDirectoryRecursive,
  readFileContent as readFileContentFs,
  writeFileContent as writeFileContentFs,
  createFileWithContent as createFileWithContentFs,
  createDirectory as createDirectoryFs,
  createEntry as createEntryFs,
  deleteFile as deleteFileFs,
  deleteDirectory as deleteDirectoryFs,
  moveFile as moveFileFs,
  ensureChecklistExists,
  readChecklist as readChecklistFs,
  writeChecklist as writeChecklistFs,
  updateChecklistOnDisk,
  isFileSystemAccessSupported,
} from "@/lib/fileSystem";
import { parseEvaActions } from "@/lib/evaActions";
import { getLanguageFromFilename } from "@/lib/utils";
import {
  analyzeChecklist as analyzeChecklistGroq,
  validateFileAndTask as validateFileGroq,
} from "@/lib/groq";
import { sanitizeFilePath, sanitizeCodeContent, MAX_CODE_LENGTH } from "@/lib/sanitize";
import {
  saveDirectoryHandle,
  getDirectoryHandle,
  clearDirectoryHandle,
  verifyDirectoryPermission,
} from "@/lib/indexedDB";
import { detectProjectType, getRuntimeForFile } from "@/lib/projectType";
import {
  runNodeInWebContainer,
  runPythonInPyodide,
  isWebContainerSupported,
  startWebContainerServer,
  updateWebContainerFiles,
  type WebContainerFile,
} from "@/lib/runtime";
import { reportErrorToAnalyst, type ChatProvider } from "@/lib/groq";
import { onExtensionMessage, pingExtension } from "@/lib/messaging";
import {
  applyAllPhaseCompletions,
  replaceTaskLineWithCompleted,
  findTasksMatchingHints,
  findTasksMatchingSavedFiles,
} from "@/lib/checklistPhase";
import { getFilePathsFromTree } from "@/lib/contextPacker";

/** Handle do diretório raiz (File System Access API). */
type DirectoryHandle = FileSystemDirectoryHandle;

interface IdeStateContextValue {
  fileTree: FileNode[];
  setFileTree: (tree: FileNode[]) => void;
  openFiles: OpenFile[];
  setOpenFiles: (files: OpenFile[] | ((prev: OpenFile[]) => OpenFile[])) => void;
  activeFilePath: string | null;
  setActiveFilePath: (path: string | null) => void;
  openFile: (file: OpenFile) => void;
  closeFile: (path: string) => void;
  outputMessages: OutputMessage[];
  addOutputMessage: (msg: Omit<OutputMessage, "id" | "timestamp">) => void;
  clearOutput: () => void;
  folderName: string | null;
  setFolderName: (name: string | null) => void;
  /** Handle do diretório aberto (null se nenhuma pasta) */
  directoryHandle: DirectoryHandle | null;
  /** Abre pasta via showDirectoryPicker, carrega árvore e garante checklist.md */
  openDirectory: () => Promise<void>;
  /** Lê conteúdo de um arquivo pelo path relativo */
  readFileContent: (relativePath: string) => Promise<string>;
  /** Escreve em arquivo existente */
  writeFileContent: (relativePath: string, content: string) => Promise<void>;
  /** Cria novo arquivo (e pastas intermediárias) e escreve conteúdo */
  createFileWithContent: (relativePath: string, content: string) => Promise<void>;
  /** Cria novo arquivo ou pasta (nome em basePath); atualiza árvore e checklist. */
  createEntryInProject: (basePath: string, name: string, type: "file" | "directory") => Promise<string | null>;
  /** Atualiza a árvore de arquivos após criar/editar */
  refreshFileTree: () => Promise<void>;
  /** Remove um arquivo pelo path relativo; atualiza árvore e fecha abas desse arquivo. */
  deleteFileInProject: (relativePath: string) => Promise<void>;
  /** Remove uma pasta e todo o conteúdo (recursivo); atualiza árvore e fecha abas de arquivos dentro. */
  deleteFolderInProject: (relativePath: string) => Promise<void>;
  /** Garante que checklist.md existe na raiz; cria com template se não existir */
  ensureChecklist: () => Promise<void>;
  /** Lê conteúdo de checklist.md */
  readChecklist: () => Promise<string>;
  /** Escreve conteúdo em checklist.md */
  writeChecklist: (content: string) => Promise<void>;
  /** Salva o arquivo atualmente ativo no disco e atualiza a árvore */
  saveCurrentFile: () => Promise<void>;
  /** Valida arquivo com o Analista; se aprovado, atualiza checklist [ ] -> [x] e persiste */
  validateFileAndUpdateChecklist: (
    taskDescription: string,
    filePath: string,
    fileName?: string
  ) => Promise<boolean>;
  /** Estado do loop de automação (idle, validating, error, awaiting_review) */
  loopStatus: LoopStatus;
  /** Remove o handle persistido (IndexedDB) e limpa a pasta atual (Fase 7). */
  forgetStoredDirectory: () => Promise<void>;
  /** Abre o modal de diff com uma sugestão do chat (botão "Implementar Mudanças"). */
  proposeChangeFromChat: (filePath: string, proposedContent: string) => Promise<void>;
  /** Abre o modal de diff com múltiplos arquivos (Entrega de Fase); opcionalmente marca phaseLines [x] ao aceitar. */
  proposeChangesFromChat: (
    files: Array<{ filePath: string; proposedContent: string }>,
    options?: { phaseLines?: string[] }
  ) => Promise<void>;
  /** Fase 8: Estado da execução do arquivo (idle | running). */
  runStatus: "idle" | "running";
  /** Fase 8: Executa o arquivo atualmente ativo (Node no WebContainer ou Python no Pyodide); saída no Output. */
  runCurrentFile: () => Promise<void>;
  /** Fase 9: Pendência de revisão (diff) antes de salvar arquivo gerado pela IA. */
  pendingDiffReview: PendingDiffReview | null;
  /** Fase 9: Aceitar conteúdo e gravar no disco; em seguida validar e atualizar checklist. */
  acceptDiffReview: (finalContent?: string) => Promise<void>;
  /** Fase 9: Rejeitar alterações; descarta e volta ao idle (incrementa contador de falhas). */
  rejectDiffReview: () => void;
  /** Fase 9/10: Atualizar conteúdo em revisão por path do arquivo (edição manual). */
  updatePendingDiffContent: (filePath: string, content: string) => void;
  /** Fase 9: Contador de falhas consecutivas na mesma tarefa (para detecção de loop). */
  consecutiveFailures: number;
  /** Fase 9: Chave da tarefa atual (para reset ao mudar de tarefa). */
  currentTaskKey: string | null;
  /** Fase 12 (Autocura): Sugestão de correção após erro de execução; Chat consome e exibe com "Aplicar Autocura". */
  pendingAutocura: { content: string } | null;
  setPendingAutocura: (v: { content: string } | null) => void;
  /** Fase 14 (Gênesis): Fila de arquivos planejados pela IA para criação/alteração em lote. */
  genesisQueue: Array<{ path: string; content: string }> | null;
  setGenesisQueue: (v: Array<{ path: string; content: string }> | null) => void;
  /** Executa a fila Gênesis: cria ou sobrescreve cada arquivo e limpa a fila. */
  executeGenesisQueue: () => Promise<void>;
  /** Tarefa do checklist que está sendo implementada (para marcar [x] ao aceitar diff do chat). */
  currentChecklistTask: { taskLine: string; taskDescription: string } | null;
  setCurrentChecklistTask: (v: { taskLine: string; taskDescription: string } | null) => void;
  /** Próxima tarefa pendente (exibida no botão "Avançar para Próxima Tarefa"). */
  nextPendingTask: { taskLine: string; taskDescription: string } | null;
  setNextPendingTask: (v: { taskLine: string; taskDescription: string } | null) => void;
  /** Marca a linha do checklist como concluída [x]. */
  markChecklistTaskDone: (taskLine: string) => Promise<void>;
  /** Escrita física do checklist: localiza a tarefa pelo texto, troca [ ] por [x] e salva no disco. Somente após isso o loop pode avançar. */
  forceMarkTaskAsDone: (taskText: string) => Promise<void>;
  /** Contagem de tarefas pendentes e concluídas (para UI "Tarefa X de Y"). */
  getChecklistProgress: () => Promise<{ totalPending: number; completedCount: number }>;
  /** Loop automático: após salvar, pedir próxima tarefa automaticamente. */
  loopAutoRunning: boolean;
  setLoopAutoRunning: (v: boolean) => void;
  /** Obtém a primeira tarefa pendente a partir do conteúdo do checklist (sem exibir no Output). */
  getNextTaskFromContent: (checklistContent: string) => Promise<{ taskLine: string; taskDescription: string } | null>;
  /** Linhas do checklist da fase atual (Entrega de Fase); usadas ao clicar em "Implementar" em mensagem multi-arquivo. */
  currentPhaseLines: string[] | null;
  setCurrentPhaseLines: (v: string[] | null) => void;
  /** Extensão EVA Bridge (Gemini): online quando content script está na página. */
  extensionOnline: boolean;
  setExtensionOnline: (v: boolean) => void;
  /** Modelo de IA do chat (Groq ou Gemini). Persistido em localStorage. */
  chatProvider: ChatProvider;
  setChatProvider: (v: ChatProvider) => void;
  /** Buffer de arquivos recebidos do Gemini durante "Executar Fase com Gemini". */
  phaseBuffer: Array<{ path: string; content: string }>;
  setPhaseBuffer: (v: Array<{ path: string; content: string }> | ((prev: Array<{ path: string; content: string }>) => Array<{ path: string; content: string }>)) => void;
  /** Linhas do checklist da fase (para marcar [x] ao clicar em "Implementar Fase"). */
  phaseBufferPhaseLines: string[] | null;
  setPhaseBufferPhaseLines: (v: string[] | null) => void;
  /** Abre Diff com todos os arquivos do phaseBuffer e phaseBufferPhaseLines; ao aceitar, salva e marca [x]. */
  implementPhaseFromBuffer: () => Promise<void>;
  /** Status do fluxo Gemini: Aguardando -> Código Recebido -> Implementado (exibido no chat). */
  geminiFlowStatus: "awaiting_gemini" | "code_received" | "implemented" | null;
  setGeminiFlowStatus: (v: "awaiting_gemini" | "code_received" | "implemented" | null) => void;
  /** Trava de execução: true enquanto mensagem está "voando" para o Gemini ou aguardando resposta. Bloqueia runNextTask para evitar envios duplicados. */
  isProcessing: boolean;
  /** Executa comandos EVA_ACTION. Criação (CREATE_FILE, CREATE_DIRECTORY) é silenciosa; deleção (DELETE_*) exige aprovação no DeletionModal. */
  executeEvaActions: (content: string) => Promise<void>;
  /** Fila de deleções pendentes de aprovação (Analista solicitou; usuário deve clicar "Apagar" no modal). */
  pendingDeletionQueue: Array<{ kind: "file" | "folder"; path: string }>;
  /** Confirma a deleção do primeiro item da fila (apaga no disco, atualiza árvore e checklist). */
  approvePendingDeletion: () => Promise<void>;
  /** Descarta o primeiro item da fila sem apagar. */
  rejectPendingDeletion: () => void;
  /** Trava de estado: grava a tarefa que acabou de ser enviada ao Gemini (evita reenviar a mesma). */
  recordLastSentTask: (taskLine: string) => void;
  /** Limpa a trava após marcar [x] no checklist (aceitar diff). */
  clearLastSentTask: () => void;
  /** Retorna false se a tarefa já foi enviada e ainda não foi concluída (evita loop redundante). */
  canSendTask: (taskLine: string) => boolean;
  /** Retorna a última tarefa enviada ao Gemini (para checar duplo envio). */
  getLastSentTaskLine: () => string | null;
  /** Registra callback chamado após o checklist ser atualizado (ex.: aceitar diff). Retorna função para desregistrar. */
  onChecklistUpdated: (fn: () => void) => () => void;
  /** Live Preview: URL do servidor no WebContainer (null quando inativo). */
  previewUrl: string | null;
  /** Inicia o Live Preview (servidor estático no WebContainer). */
  startLivePreview: () => Promise<void>;
  /** Encerra o Live Preview. */
  stopLivePreview: () => void;
  /** Atualiza arquivos no WebContainer (hot reload quando preview ativo). */
  refreshPreviewFiles: () => Promise<void>;
}

const IdeStateContext = createContext<IdeStateContextValue | null>(null);

export function IdeStateProvider({ children }: { children: React.ReactNode }) {
  const [directoryHandle, setDirectoryHandle] = useState<DirectoryHandle | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [outputMessages, setOutputMessages] = useState<OutputMessage[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [loopStatus, setLoopStatus] = useState<LoopStatus>("idle");
  const [runStatus, setRunStatus] = useState<"idle" | "running">("idle");
  const [restoreAttempted, setRestoreAttempted] = useState(false);
  const [pendingDiffReview, setPendingDiffReview] = useState<PendingDiffReview | null>(null);
  const [currentTaskKey, setCurrentTaskKey] = useState<string | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [pendingAutocura, setPendingAutocura] = useState<{ content: string } | null>(null);
  const [genesisQueue, setGenesisQueue] = useState<Array<{ path: string; content: string }> | null>(null);
  const [currentChecklistTask, setCurrentChecklistTask] = useState<{
    taskLine: string;
    taskDescription: string;
  } | null>(null);
  /** Tarefa última enviada ao Gemini; bloqueia reenvio até aceitar diff ou marcar [x]. */
  const lastSentTaskLineRef = useRef<string | null>(null);
  const [nextPendingTask, setNextPendingTask] = useState<{
    taskLine: string;
    taskDescription: string;
  } | null>(null);
  const [loopAutoRunning, setLoopAutoRunning] = useState(false);
  const [currentPhaseLines, setCurrentPhaseLines] = useState<string[] | null>(null);
  const [extensionOnline, setExtensionOnline] = useState(false);
  const [chatProvider, setChatProviderState] = useState<ChatProvider>("groq");
  const setChatProvider = useCallback((v: ChatProvider) => {
    setChatProviderState(v);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("eva_chat_provider", v);
    }
  }, []);
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const stored = localStorage.getItem("eva_chat_provider") as ChatProvider | null;
    if (stored === "groq" || stored === "gemini") setChatProviderState(stored);
  }, []);
  const [phaseBuffer, setPhaseBuffer] = useState<Array<{ path: string; content: string }>>([]);
  const [phaseBufferPhaseLines, setPhaseBufferPhaseLines] = useState<string[] | null>(null);
  const [geminiFlowStatus, setGeminiFlowStatus] = useState<"awaiting_gemini" | "code_received" | "implemented" | null>(null);
  /** Fila de deleções solicitadas pelo Analista; aguardam aprovação no DeletionModal. */
  const [pendingDeletionQueue, setPendingDeletionQueue] = useState<Array<{ kind: "file" | "folder"; path: string }>>([]);
  /** Live Preview: URL do servidor estático no WebContainer. */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const checklistUpdatedListenersRef = useRef<Set<() => void>>(new Set());

  const onChecklistUpdated = useCallback((fn: () => void) => {
    checklistUpdatedListenersRef.current.add(fn);
    return () => {
      checklistUpdatedListenersRef.current.delete(fn);
    };
  }, []);
  const notifyChecklistUpdated = useCallback(() => {
    checklistUpdatedListenersRef.current.forEach((f) => f());
  }, []);
  const addOutputMessage = useCallback(
    (msg: Omit<OutputMessage, "id" | "timestamp">) => {
      setOutputMessages((prev) => [
        ...prev,
        { ...msg, id: crypto.randomUUID(), timestamp: new Date() },
      ]);
    },
    []
  );

  /** Extensões de arquivos servíveis no Live Preview. */
  const PREVIEW_EXTENSIONS = new Set([
    "html", "htm", "css", "js", "jsx", "ts", "tsx", "mjs", "cjs", "json", "md", "txt", "svg", "xml",
  ]);

  const isPreviewRelevant = useCallback(
    (path: string) => PREVIEW_EXTENSIONS.has(path.split(".").pop()?.toLowerCase() ?? ""),
    []
  );

  const buildPreviewFiles = useCallback(async (): Promise<WebContainerFile[]> => {
    if (!directoryHandle) return [];
    const paths = getFilePathsFromTree(fileTree).filter(isPreviewRelevant);
    const files: WebContainerFile[] = [];
    let indexHtmlContent: string | null = null;
    for (const rawPath of paths) {
      const path = rawPath.replace(/^\.\//, "").replace(/^\/+/, "").trim();
      if (!path) continue;
      try {
        const content = openFiles.find((f) => f.path === rawPath)?.content ?? await readFileContentFs(directoryHandle, rawPath);
        if (path === "index.html" || path.endsWith("/index.html")) {
          if (path === "index.html") indexHtmlContent = content;
          else if (indexHtmlContent === null) indexHtmlContent = content;
        }
        files.push({ path, contents: content });
      } catch {
        // Ignora arquivos não legíveis
      }
    }
    if (indexHtmlContent != null) {
      const hasRootIndex = files.some((f) => f.path === "index.html");
      if (!hasRootIndex) {
        files.unshift({ path: "index.html", contents: indexHtmlContent });
      } else {
        const rootIdx = files.findIndex((f) => f.path === "index.html");
        if (rootIdx > 0) {
          const [root] = files.splice(rootIdx, 1);
          files.unshift(root);
        }
      }
    }
    return files;
  }, [directoryHandle, fileTree, openFiles, isPreviewRelevant]);

  const startLivePreview = useCallback(async () => {
    if (!directoryHandle) {
      addOutputMessage({ type: "info", text: "Abra uma pasta antes de iniciar o Live Preview." });
      return;
    }
    if (!isWebContainerSupported()) {
      addOutputMessage({
        type: "error",
        text: "WebContainers exigem cross-origin isolation (COOP/COEP). Use HTTPS ou localhost.",
      });
      return;
    }
    const paths = getFilePathsFromTree(fileTree);
    const hasIndexAtRoot = paths.some((p) => p === "index.html" || p.endsWith("/index.html"));
    if (!hasIndexAtRoot) {
      addOutputMessage({
        type: "error",
        text: "[ERRO] Para usar o Live Preview, o projeto deve ter um arquivo index.html na raiz.",
      });
      return;
    }
    try {
      addOutputMessage({ type: "info", text: "Iniciando Live Preview..." });
      let files: WebContainerFile[];
      try {
        files = await buildPreviewFiles();
      } catch (readErr) {
        const msg = readErr instanceof Error ? readErr.message : String(readErr);
        addOutputMessage({
          type: "error",
          text: `Erro ao ler arquivos do projeto (File System Access API): ${msg}`,
        });
        return;
      }
      if (files.length === 0) {
        addOutputMessage({ type: "warning", text: "Nenhum arquivo servível encontrado (html, css, js, etc.)." });
        return;
      }
      const fileList = files.map((f) => f.path).join(", ");
      const hasIndex = files.some((f) => f.path === "index.html");
      addOutputMessage({
        type: "info",
        text: `[PREVIEW] Arquivos enviados ao WebContainer (${files.length}): ${fileList}. index.html na raiz: ${hasIndex ? "sim" : "não"}`,
      });
      await new Promise((r) => setTimeout(r, 500));
      const url = await startWebContainerServer(files);
      addOutputMessage({ type: "info", text: "[INFO] Aguardando estabilização do servidor...." });
      await new Promise((resolve) => setTimeout(resolve, 800));
      setPreviewUrl(url);
      const newTab = window.open(url, "_blank");
      if (!newTab) {
        addOutputMessage({
          type: "warning",
          text: "O bloqueador de pop-ups impediu a abertura da aba de teste. Por favor, permita pop-ups para este site.",
        });
      } else {
        addOutputMessage({ type: "success", text: "Live Preview aberto em nova aba. Alterações serão refletidas ao salvar." });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addOutputMessage({
        type: "error",
        text: `Erro ao iniciar Live Preview: ${msg}`,
      });
    }
  }, [directoryHandle, fileTree, buildPreviewFiles, addOutputMessage]);

  const stopLivePreview = useCallback(() => setPreviewUrl(null), []);

  const refreshPreviewFiles = useCallback(async () => {
    if (!previewUrl) return;
    try {
      const files = await buildPreviewFiles();
      if (files.length > 0) await updateWebContainerFiles(files);
    } catch {
      // Falha silenciosa no hot reload
    }
  }, [previewUrl, buildPreviewFiles]);

  const openDirectory = useCallback(async () => {
    if (typeof window === "undefined" || !isFileSystemAccessSupported()) {
      addOutputMessage({
        type: "error",
        text: "File System Access API não disponível. Use HTTPS ou localhost.",
      });
      return;
    }
    try {
      if (!window.showDirectoryPicker) throw new Error("showDirectoryPicker não disponível.");
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);
      setFolderName(handle.name);
      addOutputMessage({ type: "info", text: `Pasta aberta: ${handle.name}` });
      await ensureChecklistExists(handle);
      const tree = await listDirectoryRecursive(handle);
      setFileTree(tree);
      await saveDirectoryHandle(handle);
      addOutputMessage({ type: "success", text: "Árvore de arquivos carregada. Pasta persistida (não será perdida ao atualizar)." });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        addOutputMessage({ type: "info", text: "Seleção de pasta cancelada." });
        return;
      }
      addOutputMessage({
        type: "error",
        text: `Erro ao abrir pasta: ${(err as Error).message}`,
      });
    }
  }, [addOutputMessage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unsub = onExtensionMessage((type, payload) => {
      if (type === "CODE_RESPONSE" && payload && typeof payload === "object" && "_connected" in payload) {
        setExtensionOnline(true);
      }
    });
    pingExtension().then(setExtensionOnline);
    return unsub;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isFileSystemAccessSupported() || restoreAttempted) return;
    setRestoreAttempted(true);
    getDirectoryHandle()
      .then(async (handle) => {
        if (!handle) return;
        const ok = await verifyDirectoryPermission(handle);
        if (!ok) {
          await clearDirectoryHandle();
          addOutputMessage({
            type: "info",
            text: "Permissão da pasta salva expirou. Abra a pasta novamente.",
          });
          return;
        }
        setDirectoryHandle(handle);
        setFolderName(handle.name);
        addOutputMessage({ type: "info", text: `Pasta restaurada: ${handle.name}` });
        await ensureChecklistExists(handle);
        const tree = await listDirectoryRecursive(handle);
        setFileTree(tree);
        addOutputMessage({ type: "success", text: "Projeto restaurado da última sessão." });
      })
      .catch(() => {});
  }, [addOutputMessage, restoreAttempted]);

  const forgetStoredDirectory = useCallback(async () => {
    await clearDirectoryHandle();
    setDirectoryHandle(null);
    setFolderName(null);
    setFileTree([]);
    addOutputMessage({ type: "info", text: "Pasta esquecida. Abra uma nova pasta quando quiser." });
  }, [addOutputMessage]);

  const runCurrentFile = useCallback(async () => {
    if (!activeFilePath) {
      addOutputMessage({ type: "error", text: "Nenhum arquivo aberto para executar." });
      return;
    }
    const file = openFiles.find((f) => f.path === activeFilePath);
    if (!file) {
      addOutputMessage({ type: "error", text: "Arquivo ativo não encontrado." });
      return;
    }
    const runtime = fileTree.length > 0 ? detectProjectType(fileTree) : getRuntimeForFile(activeFilePath);
    if (runtime === "unknown") {
      const byFile = getRuntimeForFile(activeFilePath);
      if (byFile === "unknown") {
        addOutputMessage({
          type: "error",
          text: "Tipo de projeto não detectado (Node ou Python). Abra um .js/.ts/.py ou uma pasta com package.json ou arquivos .py.",
        });
        return;
      }
    }
    const effectiveRuntime = runtime !== "unknown" ? runtime : getRuntimeForFile(activeFilePath);
    if (effectiveRuntime === "node" && !isWebContainerSupported()) {
      addOutputMessage({
        type: "error",
        text: "WebContainers exigem cross-origin isolation (COOP/COEP). Use HTTPS ou localhost e um navegador compatível.",
      });
      return;
    }
    setRunStatus("running");
    addOutputMessage({ type: "info", text: `Executando: ${activeFilePath} (${effectiveRuntime})...` });

    try {
      const result =
        effectiveRuntime === "python"
          ? await runPythonInPyodide(file.content)
          : await runNodeInWebContainer(activeFilePath, file.content);

      if (result.stdout.trim()) addOutputMessage({ type: "info", text: result.stdout.trim() });
      if (result.stderr.trim()) addOutputMessage({ type: "warning", text: result.stderr.trim() });

      if (!result.success) {
        addOutputMessage({ type: "error", text: result.error ?? `Código de saída: ${result.exitCode ?? 1}` });
        try {
          const suggestion = await reportErrorToAnalyst({
            taskDescription: null,
            filePath: activeFilePath,
            errorMessage: result.error ?? (result.stderr || "Erro de execução"),
            stack: undefined,
            fileContent: file.content,
            projectId: folderName ?? undefined,
          });
          setPendingAutocura({
            content: "🚨 Erro Detectado! EVA sugere esta correção:\n\n" + suggestion,
          });
          addOutputMessage({ type: "info", text: "Sugestão de autocura enviada ao Chat. Veja o painel direito." });
        } catch {
          addOutputMessage({ type: "warning", text: "Não foi possível obter sugestão do Analista." });
        }
      } else {
        addOutputMessage({ type: "success", text: "Execução concluída com sucesso." });
      }
    } catch (err) {
      addOutputMessage({
        type: "error",
        text: `Erro ao executar: ${(err as Error).message}`,
      });
    } finally {
      setRunStatus("idle");
    }
  }, [
    activeFilePath,
    openFiles,
    fileTree,
    addOutputMessage,
    directoryHandle,
  ]);

  const readFileContent = useCallback(
    async (relativePath: string): Promise<string> => {
      if (!directoryHandle) throw new Error("Nenhuma pasta aberta.");
      try {
        return await readFileContentFs(directoryHandle, relativePath);
      } catch (err) {
        throw new Error(`Erro ao ler arquivo: ${(err as Error).message}`);
      }
    },
    [directoryHandle]
  );

  const writeFileContent = useCallback(
    async (relativePath: string, content: string): Promise<void> => {
      if (!directoryHandle) throw new Error("Nenhuma pasta aberta.");
      await writeFileContentFs(directoryHandle, relativePath, content);
    },
    [directoryHandle]
  );

  const createFileWithContent = useCallback(
    async (relativePath: string, content: string): Promise<void> => {
      if (!directoryHandle) throw new Error("Nenhuma pasta aberta.");
      await createFileWithContentFs(directoryHandle, relativePath, content);
    },
    [directoryHandle]
  );

  const createEntryInProject = useCallback(
    async (
      basePath: string,
      name: string,
      type: "file" | "directory"
    ): Promise<string | null> => {
      if (!directoryHandle) {
        addOutputMessage({ type: "error", text: "Abra uma pasta antes de criar arquivos ou pastas." });
        return null;
      }
      const trimmed = name.trim();
      if (!trimmed) {
        addOutputMessage({ type: "warning", text: "Nome não pode ser vazio." });
        return null;
      }
      try {
        const relativePath = await createEntryFs(directoryHandle, basePath, trimmed, type);
        const tree = await listDirectoryRecursive(directoryHandle);
        setFileTree(tree);
        addOutputMessage({
          type: "success",
          text: type === "directory" ? `Pasta criada: ${relativePath}` : `Arquivo criado: ${relativePath}`,
        });
        return relativePath;
      } catch (err) {
        addOutputMessage({
          type: "error",
          text: `Erro ao criar ${type === "directory" ? "pasta" : "arquivo"}: ${(err as Error).message}`,
        });
        return null;
      }
    },
    [directoryHandle, addOutputMessage, setFileTree]
  );

  const refreshFileTree = useCallback(async () => {
    if (!directoryHandle) return;
    try {
      const tree = await listDirectoryRecursive(directoryHandle);
      setFileTree(tree);
    } catch {
      addOutputMessage({ type: "warning", text: "Não foi possível atualizar a árvore." });
    }
  }, [directoryHandle, addOutputMessage]);

  const deleteFileInProject = useCallback(
    async (relativePath: string) => {
      if (!directoryHandle) {
        addOutputMessage({ type: "error", text: "Abra uma pasta antes de apagar arquivos." });
        return;
      }
      const pathNorm = relativePath.replace(/^\//, "").trim();
      if (!pathNorm) return;
      try {
        await deleteFileFs(directoryHandle, pathNorm);
        setOpenFiles((prev) => prev.filter((f) => f.path !== pathNorm));
        if (activeFilePath === pathNorm) setActiveFilePath(null);
        const tree = await listDirectoryRecursive(directoryHandle);
        setFileTree(tree);
        addOutputMessage({ type: "success", text: `Arquivo removido: ${pathNorm}` });
      } catch (err) {
        addOutputMessage({ type: "error", text: `Erro ao apagar arquivo: ${(err as Error).message}` });
      }
    },
    [directoryHandle, activeFilePath, addOutputMessage]
  );

  const deleteFolderInProject = useCallback(
    async (relativePath: string) => {
      if (!directoryHandle) {
        addOutputMessage({ type: "error", text: "Abra uma pasta antes de apagar pastas." });
        return;
      }
      const pathNorm = relativePath.replace(/^\//, "").trim();
      if (!pathNorm) return;
      try {
        await deleteDirectoryFs(directoryHandle, pathNorm);
        const prefix = pathNorm.endsWith("/") ? pathNorm : pathNorm + "/";
        setOpenFiles((prev) => prev.filter((f) => f.path !== pathNorm && !f.path.startsWith(prefix)));
        if (activeFilePath === pathNorm || activeFilePath?.startsWith(prefix)) setActiveFilePath(null);
        const tree = await listDirectoryRecursive(directoryHandle);
        setFileTree(tree);
        addOutputMessage({ type: "success", text: `Pasta removida: ${pathNorm}` });
      } catch (err) {
        addOutputMessage({ type: "error", text: `Erro ao apagar pasta: ${(err as Error).message}` });
      }
    },
    [directoryHandle, activeFilePath, addOutputMessage]
  );

  const ensureChecklist = useCallback(async () => {
    if (!directoryHandle) throw new Error("Nenhuma pasta aberta.");
    await ensureChecklistExists(directoryHandle);
  }, [directoryHandle]);

  const readChecklist = useCallback(async (): Promise<string> => {
    if (!directoryHandle) throw new Error("Nenhuma pasta aberta.");
    return readChecklistFs(directoryHandle);
  }, [directoryHandle]);

  const writeChecklist = useCallback(
    async (content: string): Promise<void> => {
      if (!directoryHandle) throw new Error("Nenhuma pasta aberta.");
      await writeChecklistFs(directoryHandle, content);
    },
    [directoryHandle]
  );

  /** Checklist livre: o EVA Studio não modifica automaticamente o checklist. O usuário controla totalmente o conteúdo. */

  /** Escrita atômica: lê checklist, localiza linha, substitui [ ] por [x], grava com createWritable/close. Só após close() o loop pode avançar. */
  const markChecklistTaskDone = useCallback(
    async (taskLine: string): Promise<void> => {
      if (!directoryHandle) return;
      await updateChecklistOnDisk(directoryHandle, taskLine);
    },
    [directoryHandle]
  );

  const markChecklistPhaseDone = useCallback(
    async (taskLines: string[]): Promise<void> => {
      if (!directoryHandle || taskLines.length === 0) return;
      await updateChecklistOnDisk(directoryHandle, taskLines);
    },
    [directoryHandle]
  );

  /** Escrita física do checklist: usa updateChecklistOnDisk (createWritable/close). Somente após close() o loop avança. */
  const forceMarkTaskAsDone = useCallback(
    async (taskText: string): Promise<void> => {
      if (!directoryHandle) return;
      await updateChecklistOnDisk(directoryHandle, taskText);
    },
    [directoryHandle]
  );

  const getChecklistProgress = useCallback(async (): Promise<{ totalPending: number; completedCount: number }> => {
    if (!directoryHandle) return { totalPending: 0, completedCount: 0 };
    const content = await readChecklistFs(directoryHandle);
    const lines = content.split("\n").filter((l) => /^\s*-\s*\[\s*[ x]\s*\]/.test(l.trim()));
    let totalPending = 0;
    let completedCount = 0;
    for (const l of lines) {
      if (/\[\s*x\s*\]/i.test(l)) completedCount++;
      else totalPending++;
    }
    return { totalPending, completedCount };
  }, [directoryHandle]);

  const getNextTaskFromContent = useCallback(
    async (checklistContent: string): Promise<{ taskLine: string; taskDescription: string } | null> => {
      const raw = await analyzeChecklistGroq(checklistContent);
      const result = Array.isArray(raw) ? raw[0] : raw;
      if (!result?.taskLine || !result?.taskDescription) return null;
      return { taskLine: result.taskLine, taskDescription: result.taskDescription };
    },
    []
  );

  const recordLastSentTask = useCallback((taskLine: string) => {
    lastSentTaskLineRef.current = taskLine;
  }, []);

  const clearLastSentTask = useCallback(() => {
    lastSentTaskLineRef.current = null;
  }, []);

  const canSendTask = useCallback((taskLine: string) => {
    const last = lastSentTaskLineRef.current;
    if (last == null) return true;
    return last.trim() !== taskLine.trim();
  }, []);

  const getLastSentTaskLine = useCallback(() => lastSentTaskLineRef.current, []);

  const saveCurrentFile = useCallback(async () => {
    if (!directoryHandle) {
      addOutputMessage({ type: "info", text: "Abra uma pasta antes de salvar." });
      return;
    }
    if (!activeFilePath) {
      addOutputMessage({ type: "info", text: "Nenhum arquivo aberto para salvar." });
      return;
    }
    const file = openFiles.find((f) => f.path === activeFilePath);
    if (!file) return;
    try {
      await writeFileContentFs(directoryHandle, activeFilePath, file.content);
      setFileTree(await listDirectoryRecursive(directoryHandle));
      setOpenFiles((prev) =>
        prev.map((f) => (f.path === activeFilePath ? { ...f, isDirty: false } : f))
      );
      addOutputMessage({ type: "success", text: `Salvo: ${file.name}` });
      if (previewUrl) await refreshPreviewFiles();
    } catch (err) {
      addOutputMessage({
        type: "error",
        text: `Erro ao salvar: ${(err as Error).message}`,
      });
    }
  }, [directoryHandle, activeFilePath, openFiles, addOutputMessage, previewUrl, refreshPreviewFiles]);

  const openFile = useCallback((file: OpenFile) => {
    setOpenFiles((prev) => {
      if (prev.some((f) => f.path === file.path)) return prev;
      return [...prev, { ...file, isDirty: false }];
    });
    setActiveFilePath(file.path);
  }, []);

  const closeFile = useCallback((path: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.path !== path));
    setActiveFilePath((current) => (current === path ? null : current));
  }, []);

  const clearOutput = useCallback(() => setOutputMessages([]), []);

  const validateFileAndUpdateChecklist = useCallback(
    async (
      taskDescription: string,
      filePath: string,
      fileName?: string
    ): Promise<boolean> => {
      if (!directoryHandle) {
        addOutputMessage({ type: "error", text: "Nenhuma pasta aberta." });
        return false;
      }
      try {
        addOutputMessage({ type: "info", text: "Validando arquivo com o Analista..." });
        const fileContent = await readFileContentFs(directoryHandle, filePath);
        const validation = await validateFileGroq({
          taskDescription,
          fileContent,
          fileName: fileName ?? filePath.split("/").pop(),
        });
        if (!validation.approved) {
          addOutputMessage({
            type: "warning",
            text: `Validação: não aprovado. ${validation.reason ?? "Motivo não informado."}`,
          });
          return false;
        }
        const content = await readChecklistFs(directoryHandle);
        const newLine = validation.taskLineToMark?.trim();
        let newContent = content;
        if (newLine) {
          newContent = replaceTaskLineWithCompleted(content, newLine);
          if (newContent === content) {
            const lines = content.split("\n");
            const taskNorm = taskDescription.trim().replace(/\s+/g, " ");
            const idx = lines.findIndex((l) => {
              const desc = l.replace(/^\s*[-–—−]\s*\[\s*[ xX]\s*\]\s*/i, "").trim().replace(/\s+/g, " ");
              return desc === taskNorm || l.includes(taskDescription.trim());
            });
            if (idx >= 0 && /^\s*[-–—−]\s*\[\s*\]\s*/.test(lines[idx])) {
              lines[idx] = lines[idx].replace(/\[\s*\]/, "[x]");
              newContent = lines.join("\n");
            }
          }
        }
        await writeChecklistFs(directoryHandle, newContent);
        let contentAfter = await readChecklistFs(directoryHandle);
        const withPhase = applyAllPhaseCompletions(contentAfter);
        if (withPhase !== contentAfter) {
          await writeChecklistFs(directoryHandle, withPhase);
          contentAfter = withPhase;
        }
        setOpenFiles((prev) =>
          prev.map((f) =>
            f.path === "checklist.md" ? { ...f, content: contentAfter } : f
          )
        );
        addOutputMessage({
          type: "success",
          text: `Tarefa marcada como concluída no checklist. ${validation.reason ?? ""}`,
        });
        return true;
      } catch (err) {
        addOutputMessage({
          type: "error",
          text: `Erro ao validar/atualizar: ${(err as Error).message}`,
        });
        return false;
      }
    },
    [directoryHandle, addOutputMessage, setOpenFiles]
  );

  const updatePendingDiffContent = useCallback((filePath: string, content: string) => {
    setPendingDiffReview((prev) => {
      if (!prev) return null;
      const files = prev.files.map((f) =>
        f.filePath === filePath ? { ...f, afterContent: content } : f
      );
      return { ...prev, files };
    });
  }, []);

  const rejectDiffReview = useCallback(() => {
    setPendingDiffReview(null);
    setLoopStatus("idle");
    lastSentTaskLineRef.current = null;
    setConsecutiveFailures((c) => {
      const next = c + 1;
      addOutputMessage({ type: "info", text: "Alterações rejeitadas. Nenhum arquivo foi gravado. Pode reenviar a tarefa ao Gemini." });
      if (next >= 3) {
        addOutputMessage({
          type: "error",
          text: "Esta tarefa falhou 3 vezes seguidas. Revise o checklist ou o código e tente novamente (intervenção humana recomendada).",
        });
      }
      return next;
    });
  }, [addOutputMessage]);

  const acceptDiffReview = useCallback(
    async () => {
      const pending = pendingDiffReview;
      if (!pending || !directoryHandle || pending.files.length === 0) return;
      setPendingDiffReview(null);

      try {
        for (const file of pending.files) {
          const pathNormalized = sanitizeFilePath(file.filePath) ?? file.filePath;
          const codeSanitized = sanitizeCodeContent(file.afterContent.trim());
          if (file.beforeContent === null) {
            await createFileWithContentFs(directoryHandle, pathNormalized, codeSanitized);
          } else {
            await writeFileContentFs(directoryHandle, pathNormalized, codeSanitized);
          }
          addOutputMessage({ type: "success", text: `Arquivo salvo: ${pathNormalized}` });
          setOpenFiles((prev) =>
            prev.map((f) =>
              f.path === pathNormalized ? { ...f, content: codeSanitized, isDirty: false } : f
            )
          );
        }
        const tree = await listDirectoryRecursive(directoryHandle);
        setFileTree(tree);

        if (pending.fromChat) {
          setGeminiFlowStatus("implemented");
          setTimeout(() => setGeminiFlowStatus(null), 3000);
          const phaseLines = pending.phaseLines ?? [];
          const taskToMark = currentChecklistTask;
          setCurrentChecklistTask(null);
          const savedFilenames = pending.files.map((f) => f.filePath.split("/").pop() ?? f.filePath).filter(Boolean);
          const hintsForMatching: string[] = [
            ...pending.files.map((f) => f.filePath),
            ...savedFilenames,
            ...pending.files.flatMap((f) => [f.afterContent?.slice(0, 2000) ?? ""]),
          ].filter(Boolean);
          let content = await readChecklistFs(directoryHandle);
          const fromSavedFiles = findTasksMatchingSavedFiles(content, savedFilenames);
          const fromHints = findTasksMatchingHints(content, hintsForMatching);
          const currentTaskLine = taskToMark?.taskLine?.trim();
          const combined = Array.from(new Set([...(currentTaskLine ? [currentTaskLine] : []), ...fromSavedFiles, ...fromHints]));
          const allToMark = combined.length > 0 ? combined : phaseLines;
          if (allToMark.length > 0) {
            await markChecklistPhaseDone(allToMark);
            content = await readChecklistFs(directoryHandle);
            const withPhase = applyAllPhaseCompletions(content);
            if (withPhase !== content) {
              await writeChecklistFs(directoryHandle, withPhase);
              content = withPhase;
            } else {
              content = await readChecklistFs(directoryHandle);
            }
            setOpenFiles((prev) =>
              prev.map((f) => (f.path === "checklist.md" ? { ...f, content, isDirty: false } : f))
            );
            notifyChecklistUpdated();
            const subtopics = allToMark.slice(0, 3).map((l) => l.replace(/^\s*[-–—−]\s*\[\s*[ x]\s*\]\s*/i, "").trim().slice(0, 50)).join("; ");
            addOutputMessage({
              type: "success",
              text: `Subtópicos marcados [x] no checklist: ${subtopics}${allToMark.length > 3 ? " …" : ""}`,
            });
          } else {
            addOutputMessage({ type: "success", text: "Alterações aplicadas." });
          }
          setLoopStatus("idle");
          const nextRaw = await analyzeChecklistGroq(content);
          const nextResult = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;
          setCurrentPhaseLines(null);
          if (nextResult?.taskLine && nextResult?.taskDescription) {
            setNextPendingTask({ taskLine: nextResult.taskLine, taskDescription: nextResult.taskDescription });
          } else {
            setNextPendingTask(null);
            if (loopAutoRunning) setLoopAutoRunning(false);
          }
          lastSentTaskLineRef.current = null;
          notifyChecklistUpdated();
          return;
        }
        const firstPath = sanitizeFilePath(pending.files[0].filePath) ?? pending.files[0].filePath;
        setLoopStatus("validating");
        const approved = await validateFileAndUpdateChecklist(
          pending.taskDescription,
          firstPath,
          firstPath.split("/").pop()
        );
        setLoopStatus("idle");
        if (approved) {
          setConsecutiveFailures(0);
          await new Promise((r) => setTimeout(r, 400));
        }
        if (approved) lastSentTaskLineRef.current = null;
        if (approved) notifyChecklistUpdated();
        if (approved) {
          addOutputMessage({ type: "success", text: "Loop concluído. Pode executar novamente para a próxima tarefa." });
        } else {
          setConsecutiveFailures((c) => {
            const next = c + 1;
            addOutputMessage({ type: "info", text: "Loop concluído (tarefa não marcada como concluída)." });
            if (next >= 3) {
              addOutputMessage({
                type: "error",
                text: "Esta tarefa falhou 3 vezes seguidas. Revise o checklist ou o código e tente novamente.",
              });
            }
            return next;
          });
        }
      } catch (err) {
        setLoopStatus("error");
        addOutputMessage({ type: "error", text: `Erro ao salvar: ${(err as Error).message}` });
        setConsecutiveFailures((c) => {
          const next = c + 1;
          if (next >= 3) {
            addOutputMessage({
              type: "error",
              text: "Esta tarefa falhou 3 vezes seguidas. Intervenção humana recomendada.",
            });
          }
          return next;
        });
      }
    },
    [
      pendingDiffReview,
      directoryHandle,
      addOutputMessage,
      validateFileAndUpdateChecklist,
      setFileTree,
      currentChecklistTask,
      setCurrentChecklistTask,
      setNextPendingTask,
      markChecklistTaskDone,
      markChecklistPhaseDone,
      forceMarkTaskAsDone,
      analyzeChecklistGroq,
      readChecklistFs,
      writeChecklistFs,
      setOpenFiles,
      loopAutoRunning,
      setLoopAutoRunning,
      setGeminiFlowStatus,
      notifyChecklistUpdated,
    ]
  );

  const proposeChangeFromChat = useCallback(
    async (filePath: string, proposedContent: string) => {
      if (!directoryHandle) {
        addOutputMessage({ type: "error", text: "Abra uma pasta antes de implementar alterações." });
        return;
      }
      const pathNorm = sanitizeFilePath(filePath) ?? filePath;
      const contentSanitized = sanitizeCodeContent(proposedContent.trim());
      let beforeContent: string | null = null;
      try {
        beforeContent = await readFileContentFs(directoryHandle, pathNorm);
      } catch {
        // Arquivo não existe = novo arquivo; beforeContent permanece null
      }
      setPendingDiffReview({
        files: [{ filePath: pathNorm, beforeContent, afterContent: contentSanitized }],
        taskDescription: "",
        checklistResult: { taskDescription: "" },
        fromChat: true,
      });
      setLoopStatus("awaiting_review");
    },
    [directoryHandle, addOutputMessage]
  );

  const proposeChangesFromChat = useCallback(
    async (
      files: Array<{ filePath: string; proposedContent: string }>,
      options?: { phaseLines?: string[] }
    ) => {
      if (!directoryHandle) {
        addOutputMessage({ type: "error", text: "Abra uma pasta antes de implementar alterações." });
        return;
      }
      if (files.length === 0) return;
      const pendingFiles: Array<{ filePath: string; beforeContent: string | null; afterContent: string }> = [];
      for (const f of files) {
        const pathNorm = sanitizeFilePath(f.filePath) ?? f.filePath;
        const contentSanitized = sanitizeCodeContent(f.proposedContent.trim());
        let beforeContent: string | null = null;
        try {
          beforeContent = await readFileContentFs(directoryHandle, pathNorm);
        } catch {
          // Arquivo não existe = novo arquivo
        }
        pendingFiles.push({
          filePath: pathNorm,
          beforeContent,
          afterContent: contentSanitized,
        });
      }
      setPendingDiffReview({
        files: pendingFiles,
        taskDescription: "",
        checklistResult: { taskDescription: "" },
        fromChat: true,
        phaseLines: options?.phaseLines,
      });
      setLoopStatus("awaiting_review");
    },
    [directoryHandle, addOutputMessage]
  );

  const implementPhaseFromBuffer = useCallback(async () => {
    const buffer = phaseBuffer;
    const lines = phaseBufferPhaseLines;
    if (!buffer?.length || !directoryHandle) return;
    setPhaseBuffer([]);
    setPhaseBufferPhaseLines(null);
    const files = buffer.map((f) => ({ filePath: f.path, proposedContent: f.content }));
    const phaseLines = lines ?? undefined;
    const pendingFiles: Array<{ filePath: string; beforeContent: string | null; afterContent: string }> = [];
    for (const f of files) {
      const pathNorm = sanitizeFilePath(f.filePath) ?? f.filePath;
      const contentSanitized = sanitizeCodeContent(f.proposedContent.trim());
      let beforeContent: string | null = null;
      try {
        beforeContent = await readFileContentFs(directoryHandle, pathNorm);
      } catch {
        // Arquivo não existe
      }
      pendingFiles.push({ filePath: pathNorm, beforeContent, afterContent: contentSanitized });
    }
    setPendingDiffReview({
      files: pendingFiles,
      taskDescription: "",
      checklistResult: { taskDescription: "" },
      fromChat: true,
      phaseLines,
    });
    setLoopStatus("awaiting_review");
  }, [phaseBuffer, phaseBufferPhaseLines, directoryHandle]);

  /** Atualiza apenas a árvore de arquivos após criação/deleção. O checklist fica sob controle do usuário. */
  const refreshTreeOnly = useCallback(async () => {
    if (!directoryHandle) return;
    const tree = await listDirectoryRecursive(directoryHandle);
    setFileTree(tree);
  }, [directoryHandle]);

  const approvePendingDeletion = useCallback(async () => {
    const first = pendingDeletionQueue[0];
    if (!first || !directoryHandle) return;
    setPendingDeletionQueue((q) => q.slice(1));
    const pathNorm = first.path.replace(/^\//, "").trim();
    if (!pathNorm) return;
    try {
      if (first.kind === "folder") {
        await deleteDirectoryFs(directoryHandle, pathNorm);
        const prefix = pathNorm.endsWith("/") ? pathNorm : pathNorm + "/";
        setOpenFiles((prev) => prev.filter((f) => f.path !== pathNorm && !f.path.startsWith(prefix)));
        if (activeFilePath === pathNorm || activeFilePath?.startsWith(prefix)) setActiveFilePath(null);
      } else {
        await deleteFileFs(directoryHandle, pathNorm);
        setOpenFiles((prev) => prev.filter((f) => f.path !== pathNorm));
        if (activeFilePath === pathNorm) setActiveFilePath(null);
      }
      await refreshTreeOnly();
      addOutputMessage({
        type: "success",
        text: first.kind === "folder" ? `Pasta removida: ${pathNorm}` : `Arquivo removido: ${pathNorm}`,
      });
    } catch (err) {
      addOutputMessage({
        type: "error",
        text: `Erro ao apagar: ${(err as Error).message}`,
      });
    }
  }, [
    pendingDeletionQueue,
    directoryHandle,
    activeFilePath,
    setActiveFilePath,
    refreshTreeOnly,
    addOutputMessage,
  ]);

  const rejectPendingDeletion = useCallback(() => {
    setPendingDeletionQueue((q) => q.slice(1));
  }, []);

  const executeEvaActions = useCallback(
    async (content: string) => {
      if (!directoryHandle) return;
      const actions = parseEvaActions(content);
      for (const a of actions) {
        try {
          if (a.action === "CREATE_FILE") {
            const path = a.path.replace(/^\//, "").trim();
            if (!path) continue;
            await createFileWithContentFs(directoryHandle, path, a.content ?? "");
            await refreshTreeOnly();
            addOutputMessage({ type: "info", text: `Analista criou arquivo: ${path}` });
          } else if (a.action === "CREATE_DIRECTORY") {
            const path = a.path.replace(/^\//, "").trim();
            if (!path) continue;
            await createDirectoryFs(directoryHandle, path);
            await refreshTreeOnly();
            addOutputMessage({ type: "info", text: `Analista criou pasta: ${path}` });
          } else if (a.action === "DELETE_FILE") {
            setPendingDeletionQueue((q) => [...q, { kind: "file", path: a.path }]);
            addOutputMessage({ type: "info", text: `Analista solicitou exclusão de arquivo: ${a.path}. Aprove no modal.` });
          } else if (a.action === "DELETE_FOLDER") {
            setPendingDeletionQueue((q) => [...q, { kind: "folder", path: a.path }]);
            addOutputMessage({ type: "info", text: `Analista solicitou exclusão de pasta: ${a.path}. Aprove no modal.` });
          } else if (a.action === "MOVE_FILE") {
            await moveFileFs(directoryHandle, a.from, a.to);
            addOutputMessage({ type: "success", text: `Arquivo movido: ${a.from} → ${a.to}` });
            await refreshTreeOnly();
          }
        } catch (err) {
          addOutputMessage({
            type: "error",
            text: `EVA_ACTION falhou (${a.action}): ${(err as Error).message}`,
          });
        }
      }
    },
    [
      directoryHandle,
      addOutputMessage,
      refreshTreeOnly,
    ]
  );

  const executeGenesisQueue = useCallback(async () => {
    const queue = genesisQueue;
    if (!queue?.length || !directoryHandle) return;
    setGenesisQueue(null);
    try {
      for (const file of queue) {
        const pathNorm = sanitizeFilePath(file.path) ?? file.path;
        const contentSanitized = sanitizeCodeContent(file.content.trim());
        try {
          await readFileContentFs(directoryHandle, pathNorm);
          await writeFileContentFs(directoryHandle, pathNorm, contentSanitized);
          addOutputMessage({ type: "success", text: `Atualizado: ${pathNorm}` });
        } catch {
          await createFileWithContentFs(directoryHandle, pathNorm, contentSanitized);
          addOutputMessage({ type: "success", text: `Criado: ${pathNorm}` });
        }
      }
      const tree = await listDirectoryRecursive(directoryHandle);
      setFileTree(tree);
      addOutputMessage({ type: "success", text: "Gênesis concluído. Fila limpa." });
    } catch (err) {
      addOutputMessage({ type: "error", text: `Erro ao executar Gênesis: ${(err as Error).message}` });
    }
  }, [genesisQueue, directoryHandle, addOutputMessage]);

  const value: IdeStateContextValue = {
    fileTree,
    setFileTree,
    openFiles,
    setOpenFiles,
    activeFilePath,
    setActiveFilePath,
    openFile,
    closeFile,
    outputMessages,
    addOutputMessage,
    clearOutput,
    folderName,
    setFolderName,
    directoryHandle,
    openDirectory,
    readFileContent,
    writeFileContent,
    createFileWithContent,
    createEntryInProject,
    refreshFileTree,
    deleteFileInProject,
    deleteFolderInProject,
    ensureChecklist,
    readChecklist,
    writeChecklist,
    saveCurrentFile,
    validateFileAndUpdateChecklist,
    loopStatus,
    forgetStoredDirectory,
    proposeChangeFromChat,
    proposeChangesFromChat,
    runStatus,
    runCurrentFile,
    pendingDiffReview,
    acceptDiffReview,
    rejectDiffReview,
    updatePendingDiffContent,
    consecutiveFailures,
    currentTaskKey,
    pendingAutocura,
    setPendingAutocura,
    genesisQueue,
    setGenesisQueue,
    executeGenesisQueue,
    currentChecklistTask,
    setCurrentChecklistTask,
    nextPendingTask,
    setNextPendingTask,
    markChecklistTaskDone,
    forceMarkTaskAsDone,
    getChecklistProgress,
    loopAutoRunning,
    setLoopAutoRunning,
    getNextTaskFromContent,
    currentPhaseLines,
    setCurrentPhaseLines,
    extensionOnline,
    setExtensionOnline,
    chatProvider,
    setChatProvider,
    phaseBuffer,
    setPhaseBuffer,
    phaseBufferPhaseLines,
    setPhaseBufferPhaseLines,
    implementPhaseFromBuffer,
    geminiFlowStatus,
    setGeminiFlowStatus,
    isProcessing: geminiFlowStatus === "awaiting_gemini",
    executeEvaActions,
    pendingDeletionQueue,
    approvePendingDeletion,
    rejectPendingDeletion,
    recordLastSentTask,
    clearLastSentTask,
    canSendTask,
    getLastSentTaskLine,
    onChecklistUpdated,
    previewUrl,
    startLivePreview,
    stopLivePreview,
    refreshPreviewFiles,
  };

  return (
    <IdeStateContext.Provider value={value}>{children}</IdeStateContext.Provider>
  );
}

export function useIdeState() {
  const ctx = useContext(IdeStateContext);
  if (!ctx) throw new Error("useIdeState must be used within IdeStateProvider");
  return ctx;
}
