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

/** Estrutura de arquivo para montar no WebContainer. */
export interface WebContainerFile {
  path: string;
  contents: string;
}

type FileSystemTree = import("@webcontainer/api").FileSystemTree;

/** Converte array de arquivos em FileSystemTree para o WebContainer. */
function buildFileSystemTree(files: WebContainerFile[]): FileSystemTree {
  const root: Record<string, { file?: { contents: string }; directory?: Record<string, unknown> }> = {};
  for (const { path, contents } of files) {
    const cleanPath = path
      .replace(/^\.\//, "")
      .replace(/^\/+/, "")
      .trim();

    if (!cleanPath) continue;

    const parts = cleanPath.split("/").filter(Boolean);
    const fileName = parts.pop()!;
    let current: Record<string, { file?: { contents: string }; directory?: Record<string, unknown> }> = root;

    for (const part of parts) {
      if (!current[part]) {
        current[part] = { directory: {} };
      }
      const node = current[part];
      if (node.file) {
        current[part] = { directory: {} };
      }
      current = (current[part].directory ??= {}) as typeof current;
    }

    current[fileName] = {
      file: { contents },
    };
  }
  console.log("WebContainer FS Tree gerada:", root);
  return root as FileSystemTree;
}

/** Referência ao WebContainer para remount (hot reload). */
let webContainerRef: Awaited<ReturnType<typeof import("@webcontainer/api").WebContainer.boot>> | null = null;

/**
 * Tenta iniciar o servidor em uma porta. Retorna URL em sucesso, rejeita em falha.
 */
async function spawnServerOnPort(
  wc: Awaited<ReturnType<typeof import("@webcontainer/api").WebContainer.boot>>,
  port: number
): Promise<string> {
  const outputChunks: string[] = [];
  const getStderrSuffix = () =>
    outputChunks.length > 0 ? `\nWebContainer output: ${outputChunks.join("")}` : "";

  return new Promise<string>((resolve, reject) => {
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timeoutId);
      try {
        (wc as { off?: (e: string, fn: unknown) => void }).off?.("server-ready", onServerReady);
        (wc as { off?: (e: string, fn: unknown) => void }).off?.("error", onError);
      } catch {
        /* WebContainer pode não expor off */
      }
    };

    const doResolve = (url: string) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(url);
      }
    };

    const doReject = (err: Error) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(err);
      }
    };

    const onServerReady = (_p: number, url: string) => doResolve(url);
    const onError = (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      doReject(new Error(`${msg}${getStderrSuffix()}`));
    };

    timeoutId = setTimeout(() => {
      doReject(new Error(`Timeout: porta ${port} não respondeu em 20s.${getStderrSuffix()}`));
    }, 20000);

    wc.on?.("server-ready", onServerReady);
    wc.on?.("error", onError);

    wc.spawn("npx", ["-y", "http-server", ".", "-p", String(port), "-c-1", "--cors"])
      .then((proc) => {
        const reader = proc.output.getReader();
        (async () => {
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              outputChunks.push(value ?? "");
            }
          } catch {
            /* stream closed */
          } finally {
            reader.releaseLock();
          }
        })();
        proc.exit.then((code) => {
          if (code !== 0 && !resolved) {
            doReject(new Error(`Servidor encerrou com código ${code}.${getStderrSuffix()}`));
          }
        }).catch(() => {});
      })
      .catch((err) => {
        doReject(new Error(`${(err as Error).message}${getStderrSuffix()}`));
      });
  });
}

/**
 * Inicia um servidor estático no WebContainer e retorna a URL quando pronto.
 * Sequência: mount -> aguarda 1s -> spawn. Tenta porta 3000, fallback 3001.
 */
export async function startWebContainerServer(files: WebContainerFile[]): Promise<string> {
  const wc = await getWebContainer();
  if (!wc) throw new Error("WebContainer não inicializado.");
  webContainerRef = wc;

  const tree = buildFileSystemTree(files);
  await wc.mount(tree);
  await new Promise((r) => setTimeout(r, 1000));

  try {
    return await spawnServerOnPort(wc, 3000);
  } catch {
    return spawnServerOnPort(wc, 3001);
  }
}

/**
 * Atualiza os arquivos no WebContainer (hot reload). Deve ser chamado após salvar.
 */
export async function updateWebContainerFiles(files: WebContainerFile[]): Promise<void> {
  const wc = webContainerRef ?? (await getWebContainer());
  if (!wc) return;
  webContainerRef = wc;
  const tree = buildFileSystemTree(files);
  await wc.mount(tree);
}

/**
 * Inicia o shell interativo (jsh) no WebContainer.
 * @param onData Callback que recebe a saída do shell.
 * @returns Processo do shell com input (WritableStream) para enviar comandos.
 */
export async function spawnWebContainerShell(onData: (data: string) => void) {
  const wc = await getWebContainer();
  if (!wc) throw new Error("WebContainer não inicializado.");
  webContainerRef = wc;

  const shellProcess = await wc.spawn("jsh", {
    terminal: { cols: 80, rows: 24 },
  });

  shellProcess.output.pipeTo(
    new WritableStream<string>({
      write(data) {
        onData(data);
      },
    })
  );

  return shellProcess;
}
