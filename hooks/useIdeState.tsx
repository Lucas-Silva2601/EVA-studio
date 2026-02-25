"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type {
  FileNode,
  OpenFile,
  OutputMessage,
  ValidationResult,
  LoopStatus,
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
  renameEntry as renameEntryFs,
  moveEntry as moveEntryFs,
  ensureChecklistExists,
  readChecklist as readChecklistFs,
  writeChecklist as writeChecklistFs,
  updateChecklistOnDisk,
  isFileSystemAccessSupported,
  patchFileContents,
} from "@/lib/fileSystem";
import { parseEvaActions, type EvaAction } from "@/lib/evaActions";
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
  requestDirectoryPermission,
} from "@/lib/indexedDB";
import { detectProjectType, getRuntimeForFile } from "@/lib/projectType";
import {
  runNodeInWebContainer,
  runPythonInPyodide,
  isWebContainerSupported,
  getWebContainerUnavailableReason,
  startWebContainerServer,
  updateWebContainerFiles,
  getWebContainer,
  type WebContainerFile,
} from "@/lib/runtime";
import { reportErrorToAnalyst } from "@/lib/groq";
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
  /** Fase 8: Estado da execução do arquivo (idle | running). */
  runStatus: "idle" | "running";
  /** Fase 8: Executa o arquivo atualmente ativo (Node no WebContainer ou Python no Pyodide); saída no Output. */
  runCurrentFile: () => Promise<void>;
  /** Fase 9: Contador de falhas consecutivas na mesma tarefa (para detecção de loop). */
  consecutiveFailures: number;
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
  /** Obtém TODAS as tarefas pendentes de uma fase (para "implementar fase N"). */
  getTasksForPhase: (checklistContent: string, phaseNumber: number) => Promise<Array<{ taskLine: string; taskDescription: string }>>;
  /** Executa comandos EVA_ACTION. Criação (CREATE_FILE, CREATE_DIRECTORY) é silenciosa. */
  executeEvaActions: (content: string) => Promise<void>;
  /** Registra callback chamado após o checklist ser atualizado. Retorna função para desregistrar. */
  onChecklistUpdated: (fn: () => void) => () => void;
  /** Live Preview: URL do servidor no WebContainer (null quando inativo). */
  previewUrl: string | null;
  /** Inicia o Live Preview (servidor estático no WebContainer). */
  startLivePreview: () => Promise<void>;
  /** Encerra o Live Preview. */
  stopLivePreview: () => void;
  /** Atualiza arquivos no WebContainer (hot reload quando preview ativo). */
  refreshPreviewFiles: () => Promise<void>;
  /** Comandos sugeridos pela IA para rodar no terminal (ex.: npm install lodash). */
  pendingTerminalCommands: string[];
  /** Limpa a fila de comandos sugeridos pela IA. */
  clearPendingTerminalCommands: () => void;
  /** Ações do Analista [EVA_ACTION] aguardando revisão do usuário. */
  pendingReviewActions: EvaAction[] | null;
  /** Define as ações pendentes para revisão. */
  setPendingReviewActions: (actions: EvaAction[] | null) => void;
  /** Executa um comando arbitrário no terminal (Node ou Python). */
  runTerminalCommand: (command: string) => Promise<void>;
  /** Solicita explicitamente permissão de escrita (deve ser chamado em clique). */
  requestWritePermission: () => Promise<boolean>;
  /** Renomeia um arquivo ou pasta. */
  renameEntryInProject: (oldPath: string, newName: string) => Promise<void>;
  /** Move um arquivo ou pasta para um novo destino. */
  moveEntryInProject: (fromPath: string, toPath: string) => Promise<void>;
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
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [currentChecklistTask, setCurrentChecklistTask] = useState<{
    taskLine: string;
    taskDescription: string;
  } | null>(null);
  const [nextPendingTask, setNextPendingTask] = useState<{
    taskLine: string;
    taskDescription: string;
  } | null>(null);
  const [loopAutoRunning, setLoopAutoRunning] = useState(false);
  /** Comandos sugeridos pela IA para rodar no terminal (RUN_COMMAND). */
  const [pendingTerminalCommands, setPendingTerminalCommands] = useState<string[]>([]);
  const [pendingReviewActions, setPendingReviewActions] = useState<EvaAction[] | null>(null);

  const restoreAttemptedRef = useRef(false);
  /** Live Preview: URL do servidor estático no WebContainer. */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const checklistUpdatedListenersRef = useRef<Set<() => void>>(new Set());

  const onChecklistUpdated = useCallback((fn: () => void) => {
    checklistUpdatedListenersRef.current.add(fn);
    return () => checklistUpdatedListenersRef.current.delete(fn);
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

  const requestWritePermission = useCallback(async () => {
    if (!directoryHandle) return false;
    const ok = await requestDirectoryPermission(directoryHandle);
    if (ok) {
      addOutputMessage({ type: "success", text: "Permissão de escrita concedida." });
    }
    return ok;
  }, [directoryHandle, addOutputMessage]);
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
    } else {
      const firstHtml = files.find((f) => f.path.toLowerCase().endsWith(".html"));
      if (firstHtml) {
        files.unshift({ path: "index.html", contents: firstHtml.contents });
      }
    }
    return files;
  }, [directoryHandle, fileTree, openFiles, isPreviewRelevant]);

  const startLivePreview = useCallback(async () => {
    if (!directoryHandle) {
      addOutputMessage({ type: "info", text: "Abra uma pasta antes de iniciar o Live Preview." });
      return;
    }
    const paths = getFilePathsFromTree(fileTree);
    const hasAnyHtml = paths.some((p) => p.toLowerCase().endsWith(".html"));
    if (!hasAnyHtml) {
      addOutputMessage({
        type: "error",
        text: "[ERRO] Para usar o Live Preview, o projeto precisa ter pelo menos um arquivo .html.",
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
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${origin}/api/preview/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: files.map((f) => ({ path: f.path, contents: f.contents })) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `Sync falhou: ${res.status}`);
      }
      const url = `${origin}/api/preview/`;
      setPreviewUrl(url);
      addOutputMessage({
        type: "success",
        text: `Live Preview ativo em ${url} (mesma origem do EVA Studio). Salve os arquivos e recarregue a aba do preview para ver alterações.`,
      });
      const newTab = window.open(url, "_blank");
      if (!newTab) {
        addOutputMessage({
          type: "warning",
          text: "O bloqueador de pop-ups impediu a abertura da aba. Permita pop-ups ou acesse o link acima manualmente.",
        });
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
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const isApiPreview = previewUrl.startsWith(origin) && previewUrl.includes("/api/preview");
    try {
      const files = await buildPreviewFiles();
      if (files.length === 0) return;
      if (isApiPreview) {
        const res = await fetch(`${origin}/api/preview/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: files.map((f) => ({ path: f.path, contents: f.contents })) }),
        });
        if (!res.ok) return;
      } else {
        await updateWebContainerFiles(files);
      }
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

  // Restaura pasta salva após primeiro paint (não bloqueia inicialização)
  useEffect(() => {
    if (typeof window === "undefined" || !isFileSystemAccessSupported() || restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    const runRestore = () => {
      getDirectoryHandle()
        .then(async (handle) => {
          if (!handle) return;
          // Apenas verifica permissão de leitura para carregar a árvore
          const ok = await verifyDirectoryPermission(handle, "read");

          setDirectoryHandle(handle);
          setFolderName(handle.name);

          if (!ok) {
            addOutputMessage({
              type: "warning",
              text: `Pasta restaurada: ${handle.name}. Clique em qualquer lugar para reativar permissões se necessário.`,
            });
          } else {
            addOutputMessage({ type: "info", text: `Pasta restaurada: ${handle.name}` });
          }

          try {
            await ensureChecklistExists(handle);
            const tree = await listDirectoryRecursive(handle);
            setFileTree(tree);
          } catch (treeErr) {
            console.warn("Erro ao carregar árvore na restauração:", treeErr);
          }
        })
        .catch((err) => {
          console.error("Erro ao restaurar handle:", err);
        });
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(runRestore, { timeout: 2000 });
    } else {
      setTimeout(runRestore, 0);
    }
  }, [addOutputMessage]);

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
          addOutputMessage({ type: "info", text: `🚨 Sugestão do Analista:\n\n${suggestion}` });
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
      // Prioriza normalização total (inclusive barras) para bater com a árvore de arquivos
      const pathNorm = relativePath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
      await writeFileContentFs(directoryHandle, pathNorm, content);
      setOpenFiles((prev) =>
        prev.map((f) => {
          const fPathNorm = f.path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
          return fPathNorm === pathNorm ? { ...f, content, isDirty: false } : f;
        })
      );
    },
    [directoryHandle]
  );

  const createFileWithContent = useCallback(
    async (relativePath: string, content: string): Promise<void> => {
      if (!directoryHandle) throw new Error("Nenhuma pasta aberta.");
      const pathNorm = relativePath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
      await createFileWithContentFs(directoryHandle, pathNorm, content);
      setOpenFiles((prev) =>
        prev.map((f) => {
          const fPathNorm = f.path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
          return fPathNorm === pathNorm ? { ...f, content, isDirty: false } : f;
        })
      );
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
      const pathNorm = relativePath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
      if (!pathNorm) return;
      try {
        await deleteFileFs(directoryHandle, pathNorm);
        setOpenFiles((prev) => prev.filter((f) => {
          const fPathNorm = f.path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
          return fPathNorm !== pathNorm;
        }));
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
      const pathNorm = relativePath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
      if (!pathNorm) return;
      try {
        await deleteDirectoryFs(directoryHandle, pathNorm);
        const prefix = pathNorm.endsWith("/") ? pathNorm : pathNorm + "/";
        setOpenFiles((prev) => prev.filter((f) => {
          const fPathNorm = f.path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
          return fPathNorm !== pathNorm && !fPathNorm.startsWith(prefix);
        }));
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

  const renameEntryInProject = useCallback(
    async (oldPathRaw: string, newName: string) => {
      if (!directoryHandle) return;
      const oldPath = oldPathRaw.replace(/\\/g, "/").replace(/^\/+/, "").trim();
      try {
        const newPath = await renameEntryFs(directoryHandle, oldPath, newName);
        setOpenFiles((prev) =>
          prev.map((f) => {
            if (f.path === oldPath) return { ...f, path: newPath, name: newName };
            if (f.path.startsWith(oldPath + "/")) {
              return { ...f, path: f.path.replace(oldPath, newPath) };
            }
            return f;
          })
        );
        if (activeFilePath === oldPath) setActiveFilePath(newPath);
        else if (activeFilePath?.startsWith(oldPath + "/")) {
          setActiveFilePath(activeFilePath.replace(oldPath, newPath));
        }

        const tree = await listDirectoryRecursive(directoryHandle);
        setFileTree(tree);
        addOutputMessage({ type: "success", text: `Renomeado: ${oldPath} -> ${newName}` });
      } catch (err) {
        addOutputMessage({ type: "error", text: `Erro ao renomear: ${(err as Error).message}` });
      }
    },
    [directoryHandle, activeFilePath, addOutputMessage]
  );

  const moveEntryInProject = useCallback(
    async (fromPathRaw: string, toPathRaw: string) => {
      if (!directoryHandle) return;
      const fromPath = fromPathRaw.replace(/\\/g, "/").replace(/^\/+/, "").trim();
      const toPath = toPathRaw.replace(/\\/g, "/").replace(/^\/+/, "").trim();
      try {
        await moveEntryFs(directoryHandle, fromPath, toPath);
        setOpenFiles((prev) =>
          prev.map((f) => {
            if (f.path === fromPath) return { ...f, path: toPath };
            if (f.path.startsWith(fromPath + "/")) {
              return { ...f, path: f.path.replace(fromPath, toPath) };
            }
            return f;
          })
        );
        if (activeFilePath === fromPath) setActiveFilePath(toPath);
        else if (activeFilePath?.startsWith(fromPath + "/")) {
          setActiveFilePath(activeFilePath.replace(fromPath, toPath));
        }

        const tree = await listDirectoryRecursive(directoryHandle);
        setFileTree(tree);
        addOutputMessage({ type: "success", text: `Movido: ${fromPath} -> ${toPath}` });
      } catch (err) {
        addOutputMessage({ type: "error", text: `Erro ao mover: ${(err as Error).message}` });
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

  const getTasksForPhase = useCallback(
    async (
      checklistContent: string,
      phaseNumber: number
    ): Promise<Array<{ taskLine: string; taskDescription: string }>> => {
      const raw = await analyzeChecklistGroq(checklistContent, phaseNumber);
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((t): t is { taskLine: string; taskDescription: string } => Boolean(t?.taskDescription?.trim()))
        .map((t) => ({ taskLine: t.taskLine ?? "", taskDescription: t.taskDescription }));
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
          const lines = content.split("\n");
          const idx = lines.findIndex(l => l.includes(newLine));
          if (idx >= 0) {
            lines[idx] = lines[idx].replace(/\[\s?\]/, "[x]");
            newContent = lines.join("\n");
          } else {
            // Fallback: busca por descrição normalizada
            const taskNorm = taskDescription.trim().replace(/\s+/g, " ");
            const fallbackIdx = lines.findIndex((l) => {
              const desc = l.replace(/^\s*[-–—−]\s*\[\s*[ xX]\s*\]\s*/i, "").trim().replace(/\s+/g, " ");
              return desc === taskNorm || l.includes(taskDescription.trim());
            });
            if (fallbackIdx >= 0 && /^\s*[-–—−]\s*\[\s*\]\s*/.test(lines[fallbackIdx])) {
              lines[fallbackIdx] = lines[fallbackIdx].replace(/\[\s*\]/, "[x]");
              newContent = lines.join("\n");
            }
          }
        }
        await writeChecklistFs(directoryHandle, newContent);
        const contentAfter = await readChecklistFs(directoryHandle);
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

  /** Atualiza apenas a árvore de arquivos após criação/deleção. O checklist fica sob controle do usuário. */
  const refreshTreeOnly = useCallback(async () => {
    if (!directoryHandle) return;
    const tree = await listDirectoryRecursive(directoryHandle);
    setFileTree(tree);
  }, [directoryHandle]);

  const executeEvaActions = useCallback(
    async (content: string) => {
      if (!directoryHandle) return;
      const actions = parseEvaActions(content);
      for (const a of actions) {
        try {
          if (a.action === "CREATE_FILE") {
            const path = a.path.replace(/^\//, "").trim();
            if (!path) continue;
            await createFileWithContent(path, a.content ?? "");
            await refreshTreeOnly();
            addOutputMessage({ type: "info", text: `Analista criou arquivo: ${path}` });
          } else if (a.action === "CREATE_DIRECTORY") {
            const path = a.path.replace(/^\//, "").trim();
            if (!path) continue;
            await createDirectoryFs(directoryHandle, path);
            await refreshTreeOnly();
            addOutputMessage({ type: "info", text: `Analista criou pasta: ${path}` });
          } else if (a.action === "MOVE_FILE") {
            await moveFileFs(directoryHandle, a.from, a.to);
            addOutputMessage({ type: "success", text: `Arquivo movido: ${a.from} → ${a.to}` });
            await refreshTreeOnly();
          } else if (a.action === "RUN_COMMAND") {
            setPendingTerminalCommands((prev) => [...prev, a.command]);
            addOutputMessage({
              type: "info",
              text: `Comando sugerido pela IA (execute no terminal do seu projeto): ${a.command}`,
            });
          } else if (a.action === "PATCH_FILE") {
            try {
              const path = a.path.replace(/^\//, "").trim();
              await patchFileContents(directoryHandle, path, a.search, a.replace);
              addOutputMessage({ type: "success", text: `Patch aplicado em: ${path}` });
              await refreshFileTree();
            } catch (err) {
              addOutputMessage({ type: "error", text: `Falha ao aplicar patch: ${(err as Error).message}` });
            }
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
      createFileWithContent,
      setPendingTerminalCommands,
    ]
  );

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
    renameEntryInProject,
    moveEntryInProject,
    saveCurrentFile,
    validateFileAndUpdateChecklist,
    loopStatus,
    forgetStoredDirectory,
    runStatus,
    runCurrentFile,
    consecutiveFailures,
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
    getTasksForPhase,
    executeEvaActions,
    onChecklistUpdated,
    previewUrl,
    startLivePreview,
    stopLivePreview,
    refreshPreviewFiles,
    pendingTerminalCommands,
    clearPendingTerminalCommands: () => setPendingTerminalCommands([]),
    pendingReviewActions,
    setPendingReviewActions,
    runTerminalCommand: async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) return;

      let runtime: "node" | "python" = "node";
      if (trimmed.startsWith("pip ") || trimmed.startsWith("python ") || trimmed.includes(".py")) {
        runtime = "python";
      }

      setRunStatus("running");
      addOutputMessage({ type: "info", text: `Executando comando: ${trimmed}...` });

      try {
        if (runtime === "node") {
          const wc = await getWebContainer().catch(() => null);
          if (!wc) {
            addOutputMessage({ type: "error", text: "WebContainer não disponível para execução." });
            return;
          }
          const [prog, ...args] = trimmed.split(" ");
          const proc = await wc.spawn(prog, args);
          const reader = proc.output.getReader();
          (async () => {
            for (; ;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) addOutputMessage({ type: "info", text: value });
            }
          })();
          const exitCode = await proc.exit;
          if (exitCode === 0) {
            addOutputMessage({ type: "success", text: `Comando concluído: ${trimmed}` });
          } else {
            addOutputMessage({ type: "error", text: `Comando falhou com código ${exitCode}` });
          }
        } else {
          // Python / Pyodide
          if (trimmed.startsWith("pip install ")) {
            const pkg = trimmed.replace("pip install ", "").trim();
            addOutputMessage({ type: "info", text: `Instalando pacote Python: ${pkg}...` });
            const pyodide = await runPythonInPyodide(`import micropip; await micropip.install('${pkg}')`).catch(e => ({ success: false, error: e.message }));
            if (pyodide.success) {
              addOutputMessage({ type: "success", text: `Pacote ${pkg} instalado via micropip.` });
            } else {
              addOutputMessage({ type: "error", text: `Erro micropip: ${pyodide.error}` });
            }
          } else {
            const res = await runPythonInPyodide(trimmed);
            if (res.stdout) addOutputMessage({ type: "info", text: res.stdout });
            if (res.stderr) addOutputMessage({ type: "warning", text: res.stderr });
          }
        }
      } catch (err) {
        addOutputMessage({ type: "error", text: `Erro na execução: ${(err as Error).message}` });
      } finally {
        setRunStatus("idle");
      }
    },
    requestWritePermission,
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
