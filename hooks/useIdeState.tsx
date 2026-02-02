"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type {
  FileNode,
  OpenFile,
  OutputMessage,
  ChecklistAnalysisResult,
  ValidationResult,
  LoopStatus,
  PendingDiffReview,
} from "@/types";
import {
  listDirectoryRecursive,
  readFileContent as readFileContentFs,
  writeFileContent as writeFileContentFs,
  createFileWithContent as createFileWithContentFs,
  ensureChecklistExists,
  readChecklist as readChecklistFs,
  writeChecklist as writeChecklistFs,
  isFileSystemAccessSupported,
} from "@/lib/fileSystem";
import { getLanguageFromFilename } from "@/lib/utils";
import {
  analyzeChecklist as analyzeChecklistGroq,
  generatePromptForAiStudio as generatePromptGroq,
  validateFileAndTask as validateFileGroq,
} from "@/lib/groq";
import { sanitizeFilePath, sanitizeCodeContent, MAX_CODE_LENGTH } from "@/lib/sanitize";
import {
  saveDirectoryHandle,
  getDirectoryHandle,
  clearDirectoryHandle,
  verifyDirectoryPermission,
} from "@/lib/indexedDB";
import { packProjectContext } from "@/lib/contextPacker";
import { detectProjectType, getRuntimeForFile } from "@/lib/projectType";
import { runNodeInWebContainer, runPythonInPyodide, isWebContainerSupported } from "@/lib/runtime";
import { reportErrorToAnalyst } from "@/lib/groq";

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
  /** Garante que checklist.md existe na raiz; cria com template se não existir */
  ensureChecklist: () => Promise<void>;
  /** Lê conteúdo de checklist.md */
  readChecklist: () => Promise<string>;
  /** Escreve conteúdo em checklist.md */
  writeChecklist: (content: string) => Promise<void>;
  /** Salva o arquivo atualmente ativo no disco e atualiza a árvore */
  saveCurrentFile: () => Promise<void>;
  /** Analisa checklist via Groq e retorna próxima tarefa; exibe resultado no Output */
  analyzeAndGetNextTask: () => Promise<ChecklistAnalysisResult | null>;
  /** Gera prompt para o AI Studio com base na tarefa; exibe no Output e retorna o prompt */
  generatePromptForTask: (result: ChecklistAnalysisResult) => Promise<string>;
  /** Valida arquivo com o Analista; se aprovado, atualiza checklist [ ] -> [x] e persiste */
  validateFileAndUpdateChecklist: (
    taskDescription: string,
    filePath: string,
    fileName?: string
  ) => Promise<boolean>;
  /** Estado do loop de automação (idle, analyzing, waiting_for_ai_studio, saving, validating, error) */
  loopStatus: LoopStatus;
  /** Remove o handle persistido (IndexedDB) e limpa a pasta atual (Fase 7). */
  forgetStoredDirectory: () => Promise<void>;
  /** Abre o modal de diff com uma sugestão do chat (botão "Implementar Mudanças"). */
  proposeChangeFromChat: (filePath: string, proposedContent: string) => Promise<void>;
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
          });
          addOutputMessage({ type: "info", text: `Sugestão do Analista: ${suggestion}` });
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

  const analyzeAndGetNextTask = useCallback(async (): Promise<ChecklistAnalysisResult | null> => {
    if (!directoryHandle) {
      addOutputMessage({ type: "error", text: "Abra uma pasta antes de analisar o checklist." });
      return null;
    }
    try {
      addOutputMessage({ type: "info", text: "Analisando checklist..." });
      const content = await readChecklistFs(directoryHandle);
      const result = await analyzeChecklistGroq(content);
      if (!result.taskDescription) {
        addOutputMessage({ type: "success", text: "Nenhuma tarefa pendente no checklist." });
        return null;
      }
      addOutputMessage({
        type: "success",
        text: `Próxima tarefa: ${result.taskDescription}${result.suggestedFile ? ` (arquivo: ${result.suggestedFile})` : ""}`,
      });
      return result;
    } catch (err) {
      addOutputMessage({
        type: "error",
        text: `Erro ao analisar checklist: ${(err as Error).message}`,
      });
      return null;
    }
  }, [directoryHandle, addOutputMessage]);

  const generatePromptForTask = useCallback(
    async (result: ChecklistAnalysisResult): Promise<string> => {
      try {
        addOutputMessage({ type: "info", text: "Gerando prompt para o AI Studio..." });
        let projectContext: string | null = null;
        if (directoryHandle && fileTree.length > 0) {
          try {
            projectContext = await packProjectContext(directoryHandle, fileTree);
            addOutputMessage({ type: "info", text: "Contexto do projeto incluído no briefing." });
          } catch {
            // Continua sem contexto se falhar
          }
        }
        const prompt = await generatePromptGroq({
          taskDescription: result.taskDescription,
          suggestedFile: result.suggestedFile,
          suggestedTech: result.suggestedTech,
          projectContext,
        });
        addOutputMessage({
          type: "success",
          text: `Prompt gerado (${prompt.length} caracteres).`,
        });
        return prompt;
      } catch (err) {
        addOutputMessage({
          type: "error",
          text: `Erro ao gerar prompt: ${(err as Error).message}`,
        });
        return "";
      }
    },
    [addOutputMessage, directoryHandle, fileTree]
  );

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
          addOutputMessage({ type: "success", text: "Alterações aplicadas." });
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
    ensureChecklist,
    readChecklist,
    writeChecklist,
    saveCurrentFile,
    analyzeAndGetNextTask,
    generatePromptForTask,
    validateFileAndUpdateChecklist,
    loopStatus,
    forgetStoredDirectory,
    proposeChangeFromChat,
    runStatus,
    runCurrentFile,
    pendingDiffReview,
    acceptDiffReview,
    rejectDiffReview,
    updatePendingDiffContent,
    consecutiveFailures,
    currentTaskKey,
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
