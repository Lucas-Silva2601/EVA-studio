"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
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
import { runNodeInWebContainer, runPythonInPyodide, isWebContainerSupported } from "@/lib/runtime";
import { reportErrorToAnalyst } from "@/lib/groq";
import { onExtensionMessage, pingExtension } from "@/lib/messaging";

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
  /** Executa comandos EVA_ACTION (DELETE_FILE, MOVE_FILE) extraídos de mensagem do Analista. */
  executeEvaActions: (content: string) => Promise<void>;
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
  const [nextPendingTask, setNextPendingTask] = useState<{
    taskLine: string;
    taskDescription: string;
  } | null>(null);
  const [loopAutoRunning, setLoopAutoRunning] = useState(false);
  const [currentPhaseLines, setCurrentPhaseLines] = useState<string[] | null>(null);
  const [extensionOnline, setExtensionOnline] = useState(false);
  const [phaseBuffer, setPhaseBuffer] = useState<Array<{ path: string; content: string }>>([]);
  const [phaseBufferPhaseLines, setPhaseBufferPhaseLines] = useState<string[] | null>(null);
  const [geminiFlowStatus, setGeminiFlowStatus] = useState<"awaiting_gemini" | "code_received" | "implemented" | null>(null);
  const addOutputMessage = useCallback(
    (msg: Omit<OutputMessage, "id" | "timestamp">) => {
      setOutputMessages((prev) => [
        ...prev,
        { ...msg, id: crypto.randomUUID(), timestamp: new Date() },
      ]);
    },
    []
  );

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
      const result = await analyzeChecklistGroq(checklistContent);
      if (!result?.taskLine || !result?.taskDescription) return null;
      return { taskLine: result.taskLine, taskDescription: result.taskDescription };
    },
    []
  );

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
      const tree = await listDirectoryRecursive(directoryHandle);
      setFileTree(tree);
      addOutputMessage({ type: "success", text: `Salvo: ${file.name}` });
    } catch (err) {
      addOutputMessage({
        type: "error",
        text: `Erro ao salvar: ${(err as Error).message}`,
      });
    }
  }, [directoryHandle, activeFilePath, openFiles, addOutputMessage]);

  const openFile = useCallback((file: OpenFile) => {
    setOpenFiles((prev) => {
      if (prev.some((f) => f.path === file.path)) return prev;
      return [...prev, file];
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
          const oldLine = newLine.replace(/\[x\]/i, "[ ]");
          newContent = content.replace(oldLine, newLine);
          if (newContent === content) {
            const lines = content.split("\n");
            const idx = lines.findIndex(
              (l) => l.includes(taskDescription.trim()) || l.replace(/\s*\[[ x]\]\s*/, " ").includes(taskDescription.trim())
            );
            if (idx >= 0) {
              lines[idx] = lines[idx].replace(/- \[ \]/, "- [x]");
              newContent = lines.join("\n");
            }
          }
        }
        await writeChecklistFs(directoryHandle, newContent);
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
    [directoryHandle, addOutputMessage]
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
    setConsecutiveFailures((c) => {
      const next = c + 1;
      addOutputMessage({ type: "info", text: "Alterações rejeitadas. Nenhum arquivo foi gravado." });
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
              f.path === pathNormalized ? { ...f, content: codeSanitized } : f
            )
          );
        }
        const tree = await listDirectoryRecursive(directoryHandle);
        setFileTree(tree);

        if (pending.fromChat) {
          setLoopStatus("idle");
          setGeminiFlowStatus("implemented");
          setTimeout(() => setGeminiFlowStatus(null), 3000);
          const phaseLines = pending.phaseLines;
          const taskToMark = currentChecklistTask;
          setCurrentChecklistTask(null);
          if (phaseLines?.length) {
            await markChecklistPhaseDone(phaseLines);
            const subtopics = phaseLines.map((l) => l.replace(/^\s*-\s*\[\s*[ x]\s*\]\s*/, "").trim().slice(0, 50)).join("; ");
            addOutputMessage({
              type: "success",
              text: `Subtópicos marcados [x] no checklist: ${subtopics}${phaseLines.length > 1 ? " …" : ""}`,
            });
          } else if (taskToMark?.taskLine) {
            await forceMarkTaskAsDone(taskToMark.taskLine);
            const desc = taskToMark.taskLine.replace(/^\s*-\s*\[\s*[ x]\s*\]\s*/, "").trim().slice(0, 60);
            addOutputMessage({ type: "success", text: `Subtópico marcado [x]: ${desc}${taskToMark.taskLine.length > 60 ? "…" : ""}` });
          } else {
            addOutputMessage({ type: "success", text: "Alterações aplicadas." });
          }
          const content = await readChecklistFs(directoryHandle);
          const nextResult = await analyzeChecklistGroq(content);
          setCurrentPhaseLines(null);
          if (nextResult?.taskLine && nextResult?.taskDescription) {
            setNextPendingTask({ taskLine: nextResult.taskLine, taskDescription: nextResult.taskDescription });
          } else {
            setNextPendingTask(null);
            if (loopAutoRunning) setLoopAutoRunning(false);
          }
          return;
        }
        const firstPath = sanitizeFilePath(pending.files[0].filePath) ?? pending.files[0].filePath;
        setLoopStatus("validating");
        const approved = await validateFileAndUpdateChecklist(
          pending.taskDescription,
          firstPath,
          firstPath.split("/").pop()
        );
        if (approved) setConsecutiveFailures(0);

        setLoopStatus("idle");
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
    loopAutoRunning,
    setLoopAutoRunning,
    setGeminiFlowStatus,
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
        // Arquivo não existe = novo arquivo
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
          // Arquivo não existe
        }
        pendingFiles.push({ filePath: pathNorm, beforeContent, afterContent: contentSanitized });
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

  const executeEvaActions = useCallback(
    async (content: string) => {
      if (!directoryHandle) return;
      const actions = parseEvaActions(content);
      for (const a of actions) {
        try {
          if (a.action === "DELETE_FILE") {
            await deleteFileFs(directoryHandle, a.path);
            addOutputMessage({ type: "success", text: `Arquivo removido: ${a.path}` });
            const tree = await listDirectoryRecursive(directoryHandle);
            setFileTree(tree);
          } else if (a.action === "MOVE_FILE") {
            await moveFileFs(directoryHandle, a.from, a.to);
            addOutputMessage({ type: "success", text: `Arquivo movido: ${a.from} → ${a.to}` });
            const tree = await listDirectoryRecursive(directoryHandle);
            setFileTree(tree);
          }
        } catch (err) {
          addOutputMessage({
            type: "error",
            text: `EVA_ACTION falhou (${a.action}): ${(err as Error).message}`,
          });
        }
      }
    },
    [directoryHandle, addOutputMessage, setFileTree]
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
    phaseBuffer,
    setPhaseBuffer,
    phaseBufferPhaseLines,
    setPhaseBufferPhaseLines,
    implementPhaseFromBuffer,
    geminiFlowStatus,
    setGeminiFlowStatus,
    isProcessing: geminiFlowStatus === "awaiting_gemini",
    executeEvaActions,
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
