/**
 * Persistência do Directory Handle em IndexedDB (Fase 7).
 * No Chrome, FileSystemDirectoryHandle pode ser armazenado e recuperado;
 * o usuário não precisa reselecionar a pasta a cada refresh.
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
 * Verifica se a permissão do handle ainda está concedida.
 * Útil após restaurar o handle do IndexedDB.
 */
export async function verifyDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: "read" | "readwrite" = "read"
): Promise<boolean> {
  try {
    const state = await handle.queryPermission({ mode });
    if (state === "granted") return true;
    const newState = await handle.requestPermission({ mode });
    return newState === "granted";
  } catch {
    return false;
  }
}
