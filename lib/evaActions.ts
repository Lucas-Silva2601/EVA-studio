/**
 * Parser de comandos EVA_ACTION nas respostas do Groq (Engenheiro Chefe).
 * Criação (CREATE_FILE, CREATE_DIRECTORY) é executada silenciosamente; deleção exige aprovação na UI.
 */

export type EvaActionCreateFile = { action: "CREATE_FILE"; path: string; content?: string };
export type EvaActionCreateDir = { action: "CREATE_DIRECTORY"; path: string };
export type EvaActionDeleteFile = { action: "DELETE_FILE"; path: string };
export type EvaActionDeleteFolder = { action: "DELETE_FOLDER"; path: string };
export type EvaActionMove = { action: "MOVE_FILE"; from: string; to: string };
/** Comando para rodar no terminal do WebContainer (ex.: npm install lodash). Requer aprovação ou envio no painel Terminal. */
export type EvaActionRunCommand = { action: "RUN_COMMAND"; command: string };
/** Comando para editar um arquivo existente substituindo um trecho específico. */
export type EvaActionPatchFile = { action: "PATCH_FILE"; path: string; search: string; replace: string };
export type EvaAction =
  | EvaActionCreateFile
  | EvaActionCreateDir
  | EvaActionDeleteFile
  | EvaActionDeleteFolder
  | EvaActionMove
  | EvaActionRunCommand
  | EvaActionPatchFile;

const EVA_ACTION_REGEX = /\[EVA_ACTION\]\s*(\{[^}]+\})/gi;

/**
 * Extrai comandos [EVA_ACTION] {"action":"...", ...} de um texto (resposta do Analista).
 */
export function parseEvaActions(content: string): EvaAction[] {
  const actions: EvaAction[] = [];
  let match: RegExpExecArray | null;
  while ((match = EVA_ACTION_REGEX.exec(content)) !== null) {
    try {
      const obj = JSON.parse(match[1].trim()) as Record<string, unknown>;
      const act = obj?.action as string;
      if (act === "CREATE_FILE" && typeof obj.path === "string") {
        actions.push({
          action: "CREATE_FILE",
          path: (obj.path as string).trim(),
          content: typeof obj.content === "string" ? obj.content : undefined,
        });
      } else if (act === "CREATE_DIRECTORY" && typeof obj.path === "string") {
        actions.push({ action: "CREATE_DIRECTORY", path: (obj.path as string).trim() });
      } else if (act === "DELETE_FILE" && typeof obj.path === "string") {
        actions.push({ action: "DELETE_FILE", path: (obj.path as string).trim() });
      } else if (act === "DELETE_FOLDER" && typeof obj.path === "string") {
        actions.push({ action: "DELETE_FOLDER", path: (obj.path as string).trim() });
      } else if (act === "MOVE_FILE" && typeof obj.from === "string" && typeof obj.to === "string") {
        actions.push({
          action: "MOVE_FILE",
          from: (obj.from as string).trim(),
          to: (obj.to as string).trim(),
        });
      } else if (act === "RUN_COMMAND" && typeof obj.command === "string") {
        actions.push({ action: "RUN_COMMAND", command: (obj.command as string).trim() });
      } else if (act === "PATCH_FILE" && typeof obj.path === "string" && typeof obj.search === "string" && typeof obj.replace === "string") {
        actions.push({
          action: "PATCH_FILE",
          path: (obj.path as string).trim(),
          search: obj.search as string,
          replace: obj.replace as string,
        });
      }
    } catch {
      // ignorar JSON inválido
    }
  }
  return actions;
}

/**
 * Extrai o texto puro após a tag [EVA_ACTION] quando esta não contém um JSON.
 * Usado pelo novo backend "Mirror" para repassar o prompt do usuário diretamente ao Gemini.
 */
export function extractRawPrompt(content: string): string | null {
  if (!content.includes("[EVA_ACTION]")) return null;
  const parts = content.split("[EVA_ACTION]");
  const lastPart = parts[parts.length - 1].trim();
  // Remove as REGRAS (PARA O GEMINI) se presentes para enviar um prompt limpo
  return lastPart.split("REGRAS (PARA O GEMINI):")[0].trim();
}
