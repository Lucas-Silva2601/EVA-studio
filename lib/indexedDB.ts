/**
 * Persistência do Directory Handle em IndexedDB (Fase 7).
 * No Chrome, FileSystemDirectoryHandle pode ser armazenado e recuperado;
 * o usuário não precisa reselecionar a pasta a cada refresh.
 *
 * Suporte: a persistência do handle só funciona em navegadores que permitem
 * armazenar FileSystemDirectoryHandle no IndexedDB (ex.: Chrome). Em outros
 * navegadores, o usuário precisará reabrir a pasta após recarregar a página.
 */

const DB_NAME = "eva-studio-db";
const DB_VERSION = 1;
const STORE_NAME = "storage";
const KEY_DIRECTORY_HANDLE = "directory-handle";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Salva o Directory Handle no IndexedDB (Chrome suporta armazenar handles).
 */
export async function saveDirectoryHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(handle, KEY_DIRECTORY_HANDLE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Recupera o Directory Handle do IndexedDB, se existir.
 * Retorna null se não houver handle salvo ou se IndexedDB não estiver disponível.
 */
export async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY_DIRECTORY_HANDLE);
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
      req.onsuccess = () => {
        db.close();
        const handle = req.result as FileSystemDirectoryHandle | undefined;
        resolve(handle ?? null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Remove o Directory Handle persistido (ex.: "Esquecer pasta").
 */
export async function clearDirectoryHandle(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(KEY_DIRECTORY_HANDLE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Verifica se a permissão do handle já está concedida (sem solicitar).
 */
export async function verifyDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: "read" | "readwrite" = "read"
): Promise<boolean> {
  try {
    const state = await handle.queryPermission({ mode });
    return state === "granted";
  } catch {
    return false;
  }
}

/**
 * Solicita explicitamente a permissão ao usuário (deve ser chamado em evento de clique).
 */
export async function requestDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: "read" | "readwrite" = "readwrite"
): Promise<boolean> {
  try {
    const newState = await handle.requestPermission({ mode });
    return newState === "granted";
  } catch (err) {
    console.warn("Falha ao solicitar permissão (requer gesto do usuário):", err);
    return false;
  }
}

/** Mensagem do chat (persistida por projeto). */
export interface StoredChatMessage {
  role: "user" | "assistant";
  content: string;
  isTruncated?: boolean;
  isAutocura?: boolean;
}

function chatKey(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "default";
  return `chat_${safe}`;
}

/** Salva o histórico do chat do projeto (para identificar conversa por projeto). */
export async function saveChatMessages(
  projectId: string,
  messages: StoredChatMessage[]
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(messages, chatKey(projectId));
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

/** Carrega o histórico do chat do projeto. */
export async function getChatMessages(projectId: string): Promise<StoredChatMessage[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(chatKey(projectId));
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
      req.onsuccess = () => {
        db.close();
        const raw = req.result;
        resolve(Array.isArray(raw) ? raw : []);
      };
    });
  } catch {
    return [];
  }
}
