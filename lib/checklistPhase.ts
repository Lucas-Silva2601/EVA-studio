/**
 * Utilitários para extrair linhas de tarefas de uma Fase no checklist.md.
 * Usado para "Entrega de Fase": marcar em massa todos os subtópicos da fase.
 */

/** Linha de tarefa no formato "- [ ] ..." ou "- [x] ..." */
const TASK_LINE_REGEX = /^\s*-\s*\[\s*[ x]\s*\]\s*.+$/;

/**
 * Retorna todas as linhas de tarefa (- [ ] ou - [x]) que pertencem à seção da fase dada.
 * A seção é identificada por "## Fase N" ou "## Fase N – ..." até o próximo "##" ou fim do arquivo.
 */
export function getPhaseTaskLines(
  checklistContent: string,
  phaseIdentifier: string | number
): string[] {
  const lines = checklistContent.split("\n");
  const phaseTitle =
    typeof phaseIdentifier === "number"
      ? `## Fase ${phaseIdentifier}`
      : phaseIdentifier.startsWith("##")
        ? phaseIdentifier
        : `## ${phaseIdentifier}`;
  const phaseTitleLower = phaseTitle.toLowerCase().trim();
  const result: string[] = [];
  let insidePhase = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      const dashIdx = trimmed.search(/\s+[–\-]\s+/);
      const headingPart = dashIdx >= 0 ? trimmed.slice(0, dashIdx).trim() : trimmed;
      if (headingPart.toLowerCase() === phaseTitleLower || headingPart.toLowerCase().startsWith(phaseTitleLower + " ")) {
        insidePhase = true;
        continue;
      }
      if (insidePhase) break;
      continue;
    }
    if (insidePhase && TASK_LINE_REGEX.test(line)) {
      result.push(line);
    }
  }
  return result;
}

/**
 * Retorna os títulos de fases encontrados no checklist (ex: ["Fase 1", "Fase 2", ...]).
 * Procura por linhas que começam com "## Fase N".
 */
export function getPhaseTitles(checklistContent: string): { number: number; title: string }[] {
  const lines = checklistContent.split("\n");
  const result: { number: number; title: string }[] = [];
  const phaseRegex = /^##\s+Fase\s+(\d+)(?:\s*[–\-]\s*(.+))?/i;

  for (const line of lines) {
    const match = line.trim().match(phaseRegex);
    if (match) {
      const num = parseInt(match[1], 10);
      const title = match[2]?.trim() ?? `Fase ${num}`;
      result.push({ number: num, title });
    }
  }
  return result;
}
