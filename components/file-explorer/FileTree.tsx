"use client";

import {
  ChevronRight,
  ChevronDown,
  FileCode,
  Folder,
  FolderOpen,
  Trash2,
  FolderPlus,
  FilePlus,
  Edit2,
} from "lucide-react";
import { useState, useRef, useEffect, useImperativeHandle, forwardRef, createContext, useContext } from "react";
import type { FileNode } from "@/types";
import { useIdeState } from "@/hooks/useIdeState";
import { getLanguageFromFilename } from "@/lib/utils";

export interface FileTreeHandle {
  startCreateFile: () => void;
  startCreateDirectory: () => void;
}

const ICON_CLASS = "w-4 h-4 shrink-0 text-ds-text-secondary-light dark:text-ds-text-secondary";

function getFileIcon(name: string) {
  return <FileCode className={ICON_CLASS} aria-hidden />;
}

/** Tipo de criação pendente (novo arquivo ou nova pasta) em um caminho específico. */
type PendingCreate = { type: "file" | "directory"; basePath: string };

interface FileTreeContextValue {
  setPendingCreate: (p: PendingCreate | null) => void;
}

const FileTreeContext = createContext<FileTreeContextValue | null>(null);

interface TreeNodeProps {
  node: FileNode;
  depth: number;
}

function TreeNode({ node, depth }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const context = useContext(FileTreeContext);

  const {
    openFile,
    readFileContent,
    openFiles,
    setActiveFilePath,
    activeFilePath,
    addOutputMessage,
    deleteFileInProject,
    deleteFolderInProject,
    renameEntryInProject,
    moveEntryInProject,
  } = useIdeState();

  const isDir = node.kind === "directory";
  const hasChildren = isDir && node.children && node.children.length > 0;
  const isActive = activeFilePath === node.path;
  const alreadyOpen = openFiles.some((f) => f.path === node.path);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const handleClick = async () => {
    if (isRenaming) return;
    if (isDir) {
      setExpanded((e) => !e);
      return;
    }
    if (alreadyOpen) {
      setActiveFilePath(node.path);
      return;
    }
    setLoading(true);
    try {
      const content = await readFileContent(node.path);
      openFile({
        path: node.path,
        name: node.name,
        content,
        language: getLanguageFromFilename(node.name),
      });
    } catch (err) {
      addOutputMessage({
        type: "error",
        text: `Erro ao abrir ${node.name}: ${(err as Error).message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const msg = isDir
      ? `Apagar a pasta "${node.name}" e todo o conteúdo?`
      : `Apagar o arquivo "${node.name}"?`;
    if (!window.confirm(msg)) return;
    if (isDir) deleteFolderInProject(node.path);
    else deleteFileInProject(node.path);
  };

  const handleRename = async () => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== node.name) {
      await renameEntryInProject(node.path, trimmed);
    }
    setIsRenaming(false);
  };

  // DRAG AND DROP
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", node.path);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isDir) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const fromPath = e.dataTransfer.getData("text/plain");
    if (!fromPath || fromPath === node.path) return;

    const fileName = fromPath.split("/").pop() || "";
    const toPath = `${node.path}/${fileName}`;

    if (fromPath.startsWith(node.path + "/")) return;

    await moveEntryInProject(fromPath, toPath);
  };

  return (
    <div
      className={`select-none group ${isRenaming ? "ring-1 ring-ds-accent-neon rounded" : ""}`}
      style={{ paddingLeft: depth * 12 }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      draggable={!isRenaming}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-0 min-w-0 pr-1">
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className={`flex-1 min-w-0 flex items-center gap-1.5 py-1 px-2 rounded text-left text-sm hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon disabled:opacity-70 ${isActive ? "bg-ds-accent-light/20 dark:bg-ds-accent-neon/20 text-ds-text-primary-light dark:text-ds-text-primary" : "text-ds-text-primary-light dark:text-ds-text-primary"
            }`}
          aria-expanded={isDir ? expanded : undefined}
          aria-current={isActive ? "true" : undefined}
          aria-busy={loading}
        >
          {isDir ? (
            <>
              {expanded ? (
                <ChevronDown className={ICON_CLASS} aria-hidden />
              ) : (
                <ChevronRight className={ICON_CLASS} aria-hidden />
              )}
              {expanded ? (
                <FolderOpen className={ICON_CLASS} aria-hidden />
              ) : (
                <Folder className={ICON_CLASS} aria-hidden />
              )}
            </>
          ) : (
            <>
              <span className="w-4" aria-hidden />
              {getFileIcon(node.name)}
            </>
          )}

          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="flex-1 bg-transparent border-none p-0 focus:ring-0 text-sm text-ds-text-primary-light dark:text-ds-text-primary"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") {
                  setIsRenaming(false);
                  setNewName(node.name);
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate">{loading ? "…" : node.name}</span>
          )}
        </button>

        <div className={`flex items-center gap-0.5 transition-opacity ${showActions ? "opacity-100" : "opacity-0"}`}>
          {isDir && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); context?.setPendingCreate({ type: "file", basePath: node.path }); setExpanded(true); }}
                className="p-1 rounded hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover text-ds-text-secondary"
                title="Novo Arquivo"
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); context?.setPendingCreate({ type: "directory", basePath: node.path }); setExpanded(true); }}
                className="p-1 rounded hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover text-ds-text-secondary"
                title="Nova Pasta"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}
            className="p-1 rounded hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover text-ds-text-secondary"
            title="Renomear"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="p-1 rounded text-ds-text-secondary hover:text-red-500 hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover"
            title="Apagar"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {isDir && expanded && hasChildren && (
        <div className="border-l border-ds-border-light/30 dark:border-ds-border/30 ml-3">
          {node.children!.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export const FileTree = forwardRef<FileTreeHandle, object>(function FileTree(_, ref) {
  const { fileTree, folderName, createEntryInProject } = useIdeState();
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    startCreateFile: () => {
      setPendingCreate({ type: "file", basePath: "" });
    },
    startCreateDirectory: () => {
      setPendingCreate({ type: "directory", basePath: "" });
    },
  }), []);

  useEffect(() => {
    if (pendingCreate) {
      setInputValue("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [pendingCreate]);

  const handleConfirmCreate = async () => {
    if (!pendingCreate || !inputValue.trim()) {
      setPendingCreate(null);
      return;
    }
    const name = inputValue.trim();
    await createEntryInProject(pendingCreate.basePath, name, pendingCreate.type);
    setPendingCreate(null);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirmCreate();
    } else if (e.key === "Escape") {
      setPendingCreate(null);
      setInputValue("");
    }
  };

  if (fileTree.length === 0 && !pendingCreate) {
    return (
      <div className="p-4 text-center text-sm text-ds-text-muted select-none">
        {folderName ? <span>Pasta vazia. Use os ícones acima.</span> : <span>Nenhuma pasta aberta.</span>}
      </div>
    );
  }

  return (
    <FileTreeContext.Provider value={{ setPendingCreate }}>
      <div className="flex flex-col h-full min-h-0 relative">
        {pendingCreate && (
          <div className="p-2 border-b border-ds-border-light dark:border-ds-border bg-ds-surface-hover-light/10 dark:bg-ds-surface-hover/10">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-ds-accent-neon opacity-70 truncate max-w-[100px]">
                {pendingCreate.basePath || "Raiz"}
              </span>
              {pendingCreate.type === "directory" ? <FolderPlus className="w-4 h-4" /> : <FilePlus className="w-4 h-4" />}
              <input
                ref={inputRef}
                className="flex-1 min-w-0 bg-ds-bg-primary-light dark:bg-ds-bg-primary text-ds-text-primary-light dark:text-ds-text-primary placeholder-ds-text-muted border border-ds-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ds-accent-neon"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  setTimeout(() => {
                    if (inputValue.trim()) handleConfirmCreate();
                    else setPendingCreate(null);
                  }, 150);
                }}
                placeholder={pendingCreate.type === "directory" ? "Nome da pasta..." : "Nome do arquivo..."}
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 py-1 scrollbar-thin scrollbar-thumb-ds-border">
          {fileTree.map((node) => (
            <TreeNode key={node.path} node={node} depth={0} />
          ))}
        </div>
      </div>
    </FileTreeContext.Provider>
  );
});
