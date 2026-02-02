/**
 * Fase 8: Execução de código na IDE — WebContainers (Node) e Pyodide (Python).
 * Execução no browser; stdout/stderr são capturados e retornados.
 */

export interface RunResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode?: number;
  /** Mensagem de exceção quando success === false */
  error?: string;
}

/** Converte path relativo (ex: "src/index.js") em FileSystemTree do WebContainer. */
function pathToTree(filePath: string, contents: string): Record<string, unknown> {
  const parts = filePath.replace(/^\//, "").split("/");
  if (parts.length === 1) {
    return { [parts[0]]: { file: { contents } } };
  }
  const fileName = parts.pop()!;
  let current: Record<string, unknown> = { [fileName]: { file: { contents } } };
  for (let i = parts.length - 1; i >= 0; i--) {
    current = { [parts[i]]: { directory: current } };
  }
  return current;
}

let webContainerInstance: Awaited<ReturnType<typeof import("@webcontainer/api").WebContainer.boot>> | null = null;

/**
 * Inicializa o WebContainer (singleton). Exige cross-origin isolation (COOP/COEP).
 */
async function getWebContainer(): Promise<typeof webContainerInstance> {
  if (webContainerInstance) return webContainerInstance;
  const { WebContainer } = await import("@webcontainer/api");
  webContainerInstance = await WebContainer.boot();
  return webContainerInstance;
}

/**
 * Executa um arquivo Node.js no WebContainer (monta o arquivo e roda `node path`).
 */
export async function runNodeInWebContainer(
  filePath: string,
  fileContent: string,
  onOutput?: (chunk: string) => void
): Promise<RunResult> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const push = (chunk: string, isErr: boolean) => {
    if (isErr) stderrChunks.push(chunk);
    else stdoutChunks.push(chunk);
    onOutput?.(chunk);
  };

  try {
    const wc = await getWebContainer();
    if (!wc) throw new Error("WebContainer não inicializado.");
    const tree = pathToTree(filePath, fileContent) as Parameters<typeof wc.mount>[0];
    await wc.mount(tree);

    const process = await wc.spawn("node", [filePath]);
    const reader = process.output.getReader();
    const readOutput = (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          push(value ?? "", false);
        }
      } finally {
        reader.releaseLock();
      }
    })();
    const [exitCode] = await Promise.all([process.exit, readOutput]);
    const stdout = stdoutChunks.join("");
    const stderr = stderrChunks.join("");
    return {
      success: exitCode === 0,
      stdout,
      stderr,
      exitCode,
      error: exitCode !== 0 ? `Processo encerrou com código ${exitCode}` : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
      exitCode: 1,
      error: message,
    };
  }
}

const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.29.3/full";

interface PyodideInstance {
  setStdout: (opts: { write: (text: string) => void }) => void;
  setStderr: (opts: { write: (text: string) => void }) => void;
  runPythonAsync: (code: string) => Promise<void>;
}

let pyodideInstance: PyodideInstance | null = null;

let pyodideScriptPromise: Promise<void> | null = null;

/** Carrega o script Pyodide do CDN (uma vez). */
function loadPyodideScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Pyodide só funciona no browser."));
  const w = window as unknown as { loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideInstance> };
  if (w.loadPyodide) return Promise.resolve();
  if (pyodideScriptPromise) return pyodideScriptPromise;
  pyodideScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${PYODIDE_INDEX_URL}/pyodide.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar Pyodide do CDN."));
    document.head.appendChild(script);
  });
  return pyodideScriptPromise;
}

/**
 * Carrega Pyodide (singleton) via CDN. Primeira carga pode demorar.
 */
async function getPyodide(): Promise<PyodideInstance> {
  if (pyodideInstance) return pyodideInstance;
  await loadPyodideScript();
  const loadPyodide = (window as unknown as { loadPyodide: (opts: { indexURL: string }) => Promise<PyodideInstance> }).loadPyodide;
  if (!loadPyodide) throw new Error("loadPyodide não encontrado. Verifique se o script Pyodide carregou.");
  pyodideInstance = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  return pyodideInstance;
}

/**
 * Executa código Python no Pyodide e captura stdout/stderr.
 */
export async function runPythonInPyodide(
  code: string,
  onOutput?: (chunk: string) => void
): Promise<RunResult> {
  let stdout = "";
  let stderr = "";

  try {
    const pyodide = await getPyodide();
    pyodide.setStdout({
      write: (text: string) => {
        stdout += text;
        onOutput?.(text);
      },
    });
    pyodide.setStderr({
      write: (text: string) => {
        stderr += text;
        onOutput?.(text);
      },
    });
    await pyodide.runPythonAsync(code);
    return { success: true, stdout, stderr };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    stderr += (stack || message) + "\n";
    return {
      success: false,
      stdout,
      stderr,
      exitCode: 1,
      error: message,
    };
  }
}

/**
 * Verifica se o ambiente suporta WebContainers (SharedArrayBuffer / cross-origin isolation).
 */
export function isWebContainerSupported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return typeof SharedArrayBuffer !== "undefined";
  } catch {
    return false;
  }
}
