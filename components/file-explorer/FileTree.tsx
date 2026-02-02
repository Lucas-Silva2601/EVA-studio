"use client";

import { ChevronRight, ChevronDown, FileCode, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";
import type { FileNode } from "@/types";
import { useIdeState } from "@/hooks/useIdeState";
import { getLanguageFromFilename } from "@/lib/utils";

const ICON_CLASS = "w-4 h-4 shrink-0 text-gray-400";

function getFileIcon(name: string) {
  return <FileCode className={ICON_CLASS} aria-hidden />;
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
}

function TreeNode({ node, depth }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const { openFile, readFileContent, openFiles, setActiveFilePath, activeFilePath, folderName, addOutputMessage } = useIdeState();
  const isDir = node.kind === "directory";
  const hasChildren = isDir && node.children && node.children.length > 0;
  const isActive = activeFilePath === node.path;
  const alreadyOpen = openFiles.some((f) => f.path === node.path);

  const handleClick = async () => {
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

  return (
    <div className="select-none" style={{ paddingLeft: depth * 12 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`w-full flex items-center gap-1.5 py-1 px-2 rounded text-left text-sm hover:bg-vscode-sidebar-hover focus:outline-none focus:ring-1 focus:ring-vscode-accent disabled:opacity-70 ${
          isActive ? "bg-vscode-accent/20 text-white" : "text-gray-300"
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
        <span className="truncate">{loading ? "…" : node.name}</span>
      </button>
      {isDir && expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Árvore de arquivos na sidebar. Exibe "Nenhuma pasta selecionada" quando fileTree está vazio.
 */
export function FileTree() {
  const { fileTree, folderName } = useIdeState();

  if (fileTree.length === 0) {
    return (
      <div
        className="p-4 text-center text-sm text-gray-500"
        role="status"
        aria-live="polite"
      >
        {folderName ? "Nenhum arquivo na pasta." : "Nenhuma pasta selecionada."}
        <br />
        <span className="text-xs">Use &quot;Abrir pasta&quot; na barra de título.</span>
      </div>
    );
  }

  return (
    <div className="py-2" role="tree" aria-label="Explorador de arquivos">
      {fileTree.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}
