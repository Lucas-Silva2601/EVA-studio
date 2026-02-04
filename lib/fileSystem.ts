/**
 * Lógica de arquivos via File System Access API (Fase 2).
 * Funciona apenas em contexto seguro (HTTPS ou localhost).
 *
 * Erros (permissão negada, arquivo inexistente, caminho inválido) são lançados;
 * o chamador deve tratá-los e exibir ao usuário (ex.: addOutputMessage no Output).
 */

import type { FileNode } from "@/types";

/** Pastas ignoradas na listagem (configurável). */
export const DEFAULT_IGNORE_DIRS = [
  "node_modules",
  ".git",
  ".next",
  "out",
  "build",
  "dist",
  "__pycache__",
  ".venv",
  "venv",
];

/**
 * Lista recursivamente arquivos e pastas a partir do handle, construindo árvore.
 * @param handle - Handle do diretório raiz
 * @param basePath - Caminho base acumulado (ex: "" ou "src/components")
 * @param ignoreDirs - Nomes de pastas a ignorar
 */
export async function listDirectoryRecursive(
  handle: FileSystemDirectoryHandle,
  basePath = "",
  ignoreDirs: string[] = DEFAULT_IGNORE_DIRS
): Promise<FileNode[]> {
  const nodes: FileNode[] = [];
  const entries: FileNode[] = [];

  for await (const [name, entry] of handle.entries()) {
    const path = basePath ? `${basePath}/${name}` : name;

    if (entry.kind === "directory") {
      if (ignoreDirs.includes(name)) continue;
      const children = await listDirectoryRecursive(
        entry as FileSystemDirectoryHandle,
        path,
        ignoreDirs
      );
      entries.push({ name, path, kind: "directory", children });
    } else {
      entries.push({ name, path, kind: "file" });
    }
  }

  // Ordenar: pastas primeiro, depois arquivos; alfabético
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return entries;
}

/**
 * Lê o conteúdo de um arquivo dado o path relativo à raiz.
 * @throws Se o arquivo não existir ou permissão negada
 */
export async function readFileContent(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<string> {
  const parts = relativePath.replace(/^\//, "").split("/");
  if (parts.length === 0) throw new Error("Caminho inválido");

  let current: FileSystemHandle = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    const dir = await (current as FileSystemDirectoryHandle).getDirectoryHandle(parts[i]);
    current = dir;
  }
  const fileName = parts[parts.length - 1];
  const fileHandle = await (current as FileSystemDirectoryHandle).getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}

/**
 * Escreve conteúdo em um arquivo existente (path relativo).
 * Cria pastas intermediárias se o arquivo já existir; caso contrário use createFileWithContent.
 */
export async function writeFileContent(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
  content: string
): Promise<void> {
  const parts = relativePath.replace(/^\//, "").split("/");
  if (parts.length === 0) throw new Error("Caminho inválido");

  let current = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }
  const fileName = parts[parts.length - 1];
  const fileHandle = await current.getFileHandle(fileName);
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Cria um novo arquivo (e pastas intermediárias se necessário) com o conteúdo dado.
 */
export async function createFileWithContent(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
  content: string
): Promise<void> {
  const parts = relativePath.replace(/^\//, "").split("/");
  if (parts.length === 0) throw new Error("Caminho inválido");

  let current = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i], { create: true });
  }
  const fileName = parts[parts.length - 1];
  const fileHandle = await current.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Verifica se a File System Access API está disponível (contexto seguro).
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * Nome do arquivo central de controle do projeto.
 */
export const CHECKLIST_FILENAME = "checklist.md";

/**
 * Template mínimo para checklist.md quando criado pela primeira vez.
 */
export const CHECKLIST_TEMPLATE = `# Checklist – Projeto

> Arquivo central de controle. Use \`[ ]\` para pendente e \`[x]\` para concluído.

- [ ] Exemplo de tarefa
`;

/**
 * Garante que checklist.md existe na raiz; cria com template se não existir.
 */
export async function ensureChecklistExists(
  rootHandle: FileSystemDirectoryHandle
): Promise<void> {
  try {
    await rootHandle.getFileHandle(CHECKLIST_FILENAME);
  } catch {
    await createFileWithContent(rootHandle, CHECKLIST_FILENAME, CHECKLIST_TEMPLATE);
  }
}

/**
 * Lê o conteúdo de checklist.md na raiz da pasta aberta.
 */
export async function readChecklist(
  rootHandle: FileSystemDirectoryHandle
): Promise<string> {
  return readFileContent(rootHandle, CHECKLIST_FILENAME);
}

/**
 * Escreve o conteúdo em checklist.md na raiz.
 */
export async function writeChecklist(
  rootHandle: FileSystemDirectoryHandle,
  content: string
): Promise<void> {
  try {
    await writeFileContent(rootHandle, CHECKLIST_FILENAME, content);
  } catch {
    await createFileWithContent(rootHandle, CHECKLIST_FILENAME, content);
  }
}

/**
 * Escrita atômica do checklist: lê o arquivo, localiza a(s) linha(s) da tarefa, substitui [ ] por [x],
 * grava no disco com fileHandle.createWritable() e só resolve após close().
 * Somente após o close() o loop pode avançar para a próxima tarefa.
 * @param taskLineOrLines - linha exata ou texto da tarefa; ou array de linhas (fase).
 */
export async function updateChecklistOnDisk(
  rootHandle: FileSystemDirectoryHandle,
  taskLineOrLines: string | string[]
): Promise<void> {
  const content = await readChecklist(rootHandle);
  const lines = content.split("\n");
  const toMark = Array.isArray(taskLineOrLines) ? taskLineOrLines : [taskLineOrLines];
  const trimSet = new Set(toMark.map((l) => l.trim()));
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (trimSet.has(line.trim()) && /-\s*\[\s*\]\s*/.test(line)) {
      lines[i] = line.replace(/- \[ \]/, "- [x]");
      changed = true;
    }
  }
  if (!changed && !Array.isArray(taskLineOrLines)) {
    const taskTrim = taskLineOrLines.trim();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(taskTrim) && /-\s*\[\s*\]\s*/.test(lines[i])) {
        lines[i] = lines[i].replace(/- \[ \]/, "- [x]");
        changed = true;
        break;
      }
    }
  }
  if (!changed) return;
  const newContent = lines.join("\n");
  const fileHandle = await rootHandle.getFileHandle(CHECKLIST_FILENAME);
  const writable = await fileHandle.createWritable();
  await writable.write(newContent);
  await writable.close();
}

/**
 * Remove um arquivo pelo path relativo à raiz.
 * Requer permissão readwrite no diretório.
 */
export async function deleteFile(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<void> {
  const path = relativePath.replace(/^\//, "").trim();
  if (!path) throw new Error("Caminho inválido");
  const parts = path.split("/");
  if (parts.length === 1) {
    await rootHandle.removeEntry(parts[0]);
    return;
  }
  let current: FileSystemDirectoryHandle = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }
  await current.removeEntry(parts[parts.length - 1]);
}

/**
 * Remove uma pasta e todo o conteúdo (recursivo) pelo path relativo à raiz.
 * Requer permissão readwrite no diretório.
 */
export async function deleteDirectory(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<void> {
  const path = relativePath.replace(/^\//, "").trim();
  if (!path) throw new Error("Caminho inválido");
  const parts = path.split("/");
  if (parts.length === 1) {
    await rootHandle.removeEntry(parts[0], { recursive: true });
    return;
  }
  let current: FileSystemDirectoryHandle = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }
  await current.removeEntry(parts[parts.length - 1], { recursive: true });
}

/**
 * Move um arquivo (lê, cria no destino, remove na origem) para comandos EVA_ACTION do Groq.
 */
export async function moveFile(
  rootHandle: FileSystemDirectoryHandle,
  fromPath: string,
  toPath: string
): Promise<void> {
  const content = await readFileContent(rootHandle, fromPath);
  await createFileWithContent(rootHandle, toPath, content);
  await deleteFile(rootHandle, fromPath);
}
