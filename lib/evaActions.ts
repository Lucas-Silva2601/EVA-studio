/**
 * Parser de comandos EVA_ACTION nas respostas do Groq (Engenheiro Chefe).
 * O Groq pode pedir exclusão ou movimentação de arquivos após o Gemini gerar código.
 */

export type EvaActionDelete = { action: "DELETE_FILE"; path: string };
export type EvaActionMove = { action: "MOVE_FILE"; from: string; to: string };
export type EvaAction = EvaActionDelete | EvaActionMove;

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
      if (act === "DELETE_FILE" && typeof obj.path === "string") {
        actions.push({ action: "DELETE_FILE", path: obj.path.trim() });
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
