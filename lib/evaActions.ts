/**
 * Parser de comandos EVA_ACTION nas respostas do Groq (Engenheiro Chefe).
 * Criação (CREATE_FILE, CREATE_DIRECTORY) é executada silenciosamente; deleção exige aprovação na UI.
 */

export type EvaActionCreateFile = { action: "CREATE_FILE"; path: string; content?: string };
export type EvaActionCreateDir = { action: "CREATE_DIRECTORY"; path: string };
export type EvaActionDeleteFile = { action: "DELETE_FILE"; path: string };
export type EvaActionDeleteFolder = { action: "DELETE_FOLDER"; path: string };
export type EvaActionMove = { action: "MOVE_FILE"; from: string; to: string };
export type EvaAction =
  | EvaActionCreateFile
  | EvaActionCreateDir
  | EvaActionDeleteFile
  | EvaActionDeleteFolder
  | EvaActionMove;

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
      }
    } catch {
      // ignorar JSON inválido
    }
  }
  return actions;
}
