/**
 * Utilitários para extrair linhas de tarefas de uma Fase no checklist.md.
 * Usado para "Entrega de Fase": marcar em massa todos os subtópicos da fase.
 * Regex resiliente a espaços extras, hífens (– vs -) e variações de caixa.
 */

/** Linha de tarefa no formato "- [ ] ..." ou "- [x] ..." (resiliente a – vs - e caixa). */
const TASK_LINE_REGEX = /^\s*[-–—−]\s*\[\s*[ xX]\s*\]\s*.+/;

/** Regex para linha ainda pendente ([ ]). */
const PENDING_TASK_REGEX = /^\s*[-–—−]\s*\[\s*\]\s*.+/;

/** Regex para linha concluída ([x]). */
const COMPLETED_TASK_REGEX = /^\s*[-–—−]\s*\[\s*[xX]\s*\]\s*.+/i;

/**
 * Retorna a primeira linha de tarefa PENDENTE ([ ]) no checklist, na ordem do documento.
 * Usado para validar que o Analista retornou a próxima tarefa na sequência lógica.
 */
export function getFirstPendingTaskLine(checklistContent: string): string | null {
  const lines = checklistContent.split("\n");
  for (const line of lines) {
    if (PENDING_TASK_REGEX.test(line)) return line;
  }
  return null;
}

/** Regex para cabeçalho de fase: ## Fase N ou ## Fase N – Título (case-insensitive, aceita – ou -) */
const PHASE_HEADER_REGEX = /^##\s+fase\s+(\d+)(?:\s*[–\-]\s*.*)?/i;

/**
 * Retorna todas as linhas de tarefa (- [ ] ou - [x]) que pertencem à seção da fase dada.
 * A seção é identificada por "## Fase N" ou "## Fase N – ..." até o próximo "##" ou fim do arquivo.
 * Resiliente a espaços extras, – vs -, e variações de caixa.
 */
export function getPhaseTaskLines(
  checklistContent: string,
  phaseIdentifier: string | number
): string[] {
  const lines = checklistContent.split("\n");
  const targetNum =
    typeof phaseIdentifier === "number"
      ? phaseIdentifier
      : parseInt(String(phaseIdentifier).replace(/\D/g, ""), 10);
  const result: string[] = [];
  let insidePhase = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const phaseMatch = trimmed.match(PHASE_HEADER_REGEX);
    if (phaseMatch) {
      const num = parseInt(phaseMatch[1], 10);
      if (num === targetNum) {
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

/** Caracteres de controle invisíveis e especiais que podem vir do salvamento em disco. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF\u00AD]/g;

/** Hífens Unicode variantes (en-dash, em-dash, minus) para normalizar ao hífen ASCII. */
const HYPHEN_VARIANTS = /[–—−‐‑‒―]/g;

/**
 * Normaliza uma linha de tarefa para comparação.
 * Remove: caracteres especiais, caracteres de controle, normaliza hífens (–—−→-), espaços extras, case para [x].
 */
export function normalizeTaskLine(line: string): string {
  return line
    .replace(CONTROL_CHARS, "")
    .replace(HYPHEN_VARIANTS, "-")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\[\s*\]/g, "[ ]")
    .replace(/\[\s*[xX]\s*\]/gi, "[x]");
}

/**
 * Remove formatação markdown (**, __, *, _, `) para comparação.
 * Ex: "**Criar index.html**" → "Criar index.html"
 */
export function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim();
}

/**
 * Extrai a descrição da tarefa (texto após o checkbox) de uma linha.
 */
function extractTaskDescription(line: string): string {
  return line.replace(/^\s*[-–—−]\s*\[\s*[ xX]\s*\]\s*/i, "").trim().replace(/\s+/g, " ");
}

/**
 * Substitui uma linha de tarefa [ ] por [x] no conteúdo, de forma resiliente a espaços extras,
 * hífens (– vs -) e variações de caixa. Usa comparação normalizada para localizar a linha.
 */
export function replaceTaskLineWithCompleted(
  content: string,
  taskLineToMark: string
): string {
  const targetDesc = extractTaskDescription(taskLineToMark);
  if (!targetDesc) return content;
  const lines = content.split("\n");
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!PENDING_TASK_REGEX.test(line)) continue;
    const lineDesc = extractTaskDescription(line);
    if (lineDesc !== targetDesc) continue;
    lines[i] = line.replace(/\[\s*\]/, "[x]");
    changed = true;
    break;
  }
  return changed ? lines.join("\n") : content;
}

/**
 * Retorna o número da linha (1-based) em que a taskLine aparece no conteúdo.
 * Resiliente a variações de espaços e caracteres.
 */
export function getLineNumberForTask(checklistContent: string, taskLine: string): number | null {
  const lines = checklistContent.split("\n");
  const taskNorm = normalizeTaskLine(taskLine);
  const taskDesc = taskLine.replace(/^\s*[-–—−]\s*\[\s*[ xX]\s*\]\s*/i, "").trim();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (normalizeTaskLine(line) === taskNorm) return i + 1;
    if (TASK_LINE_REGEX.test(line) && line.includes(taskDesc)) return i + 1;
  }
  return null;
}

/**
 * Retorna tarefas categorizadas por fase e status.
 * Permite à IDE saber o que falta em cada seção sem depender apenas do Groq.
 */
export function getTasksByStatus(checklistContent: string): {
  [phaseNumber: number]: { pending: string[]; completed: string[] };
} {
  const titles = getPhaseTitles(checklistContent);
  const result: { [phaseNumber: number]: { pending: string[]; completed: string[] } } = {};
  for (const { number } of titles) {
    const lines = getPhaseTaskLines(checklistContent, number);
    const pending: string[] = [];
    const completed: string[] = [];
    for (const line of lines) {
      if (PENDING_TASK_REGEX.test(line)) pending.push(line);
      else if (COMPLETED_TASK_REGEX.test(line)) completed.push(line);
    }
    result[number] = { pending, completed };
  }
  return result;
}

/**
 * Retorna a linha da "caixa principal" da fase (primeira linha de tarefa na seção que contém "Fase N").
 * Usada para marcar a fase inteira como [x] quando todas as sub-tarefas estão concluídas.
 */
export function getPhaseHeaderCheckboxLine(
  checklistContent: string,
  phaseNumber: number
): string | null {
  const phaseLines = getPhaseTaskLines(checklistContent, phaseNumber);
  const phaseTitle = `Fase ${phaseNumber}`;
  for (const line of phaseLines) {
    if (line.toLowerCase().includes(phaseTitle.toLowerCase())) return line;
  }
  return phaseLines.length > 0 ? phaseLines[0] : null;
}

/**
 * Se todas as sub-tarefas da fase estão [x], marca a linha "principal" da fase (header checkbox) com [x].
 * Retorna o conteúdo atualizado ou o mesmo conteúdo se nada mudou.
 */
export function applyPhaseHeaderMarkIfComplete(
  checklistContent: string,
  phaseNumber: number
): string {
  const phaseTaskLines = getPhaseTaskLines(checklistContent, phaseNumber);
  if (phaseTaskLines.length === 0) return checklistContent;
  const allDone = phaseTaskLines.every((l) => COMPLETED_TASK_REGEX.test(l));
  if (!allDone) return checklistContent;
  const headerLine = getPhaseHeaderCheckboxLine(checklistContent, phaseNumber);
  if (!headerLine || COMPLETED_TASK_REGEX.test(headerLine)) return checklistContent;
  const lines = checklistContent.split("\n");
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (normalizeTaskLine(lines[i]) === normalizeTaskLine(headerLine) && PENDING_TASK_REGEX.test(lines[i])) {
      lines[i] = lines[i].replace(/\[\s*\]/, "[x]");
      changed = true;
      break;
    }
  }
  return changed ? lines.join("\n") : checklistContent;
}

/**
 * Extrai a descrição de uma taskLine (texto após o checkbox). Se já for só descrição, normaliza.
 */
function extractDesc(line: string): string {
  const m = line.match(/^\s*[-–—−]\s*\[\s*[ xX]\s*\]\s*(.*)/i);
  return (m ? m[1] : line).trim().replace(/\s+/g, " ");
}

/**
 * Retorna linhas de tarefa pendentes cuja descrição está contida nos hints (arquivos, resposta da IA).
 * Case-insensitive, ignora formatação markdown (**negrito**, __sublinhado__, etc).
 * Ex: tarefa "- [ ] **Criar index.html**" dá match com hint "index.html".
 */
export function findTasksMatchingHints(
  checklistContent: string,
  hints: string[]
): string[] {
  const hintText = hints.join(" ").toLowerCase().replace(/\s+/g, " ");
  const lines = checklistContent.split("\n");
  const toMark: string[] = [];
  for (const line of lines) {
    if (!PENDING_TASK_REGEX.test(line)) continue;
    const descRaw = extractTaskDescription(line);
    const desc = stripMarkdownFormatting(descRaw).toLowerCase();
    if (!desc || desc.length < 3) continue;
    const words = desc.split(/\s+/).filter((w) => w.length > 2);
    const significant = words.slice(0, 3).join(" ");
    if (hintText.includes(desc) || hintText.includes(significant)) {
      toMark.push(line);
      continue;
    }
    if (hints.some((h) => h.toLowerCase().includes(desc.slice(0, 20)))) {
      toMark.push(line);
      continue;
    }
    const keywordMatch = words.some((w) => w.length > 3 && hintText.includes(w));
    if (keywordMatch) {
      toMark.push(line);
    }
  }
  return toMark;
}

/**
 * Retorna linhas de tarefa pendentes que contêm o nome de um dos arquivos salvos.
 * Case-insensitive, ignora markdown. Ex: "Criar index.html" ou "**Definir style.css**" → match com index.html, style.css.
 */
export function findTasksMatchingSavedFiles(
  checklistContent: string,
  savedFilenames: string[]
): string[] {
  const lines = checklistContent.split("\n");
  const toMark: string[] = [];
  const namesLower = savedFilenames
    .map((f) => f.split("/").pop() ?? f)
    .filter(Boolean)
    .map((n) => n.toLowerCase());
  for (const line of lines) {
    if (!PENDING_TASK_REGEX.test(line)) continue;
    const descRaw = extractTaskDescription(line);
    const descClean = stripMarkdownFormatting(descRaw).toLowerCase();
    if (!descClean) continue;
    for (const fname of namesLower) {
      if (fname.length < 2) continue;
      if (descClean.includes(fname)) {
        toMark.push(line);
        break;
      }
    }
  }
  return toMark;
}

/**
 * Procura pela última seção ## Fase X que contenha tarefas pendentes ([ ]).
 * Usado para identificar em qual fase estamos antes de pedir o prompt ao Gemini.
 */
export function getCurrentPhaseFromChecklist(checklistContent: string): number {
  const lines = checklistContent.split("\n");
  let lastPhaseWithPending = 1;
  let currentPhase = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    const phaseMatch = trimmed.match(/^##\s+fase\s+(\d+)/i);
    if (phaseMatch) {
      currentPhase = parseInt(phaseMatch[1], 10);
    }
    if (PENDING_TASK_REGEX.test(line)) {
      lastPhaseWithPending = currentPhase;
    }
  }
  return lastPhaseWithPending;
}

/**
 * Retorna o número da fase que contém a PRIMEIRA tarefa pendente ([ ]) no documento.
 * Usado para dar continuidade ao projeto na ordem correta (não pular tarefas da Fase 1 quando a Fase 2 também tem pendentes).
 */
export function getPhaseOfFirstPendingTask(checklistContent: string): number {
  const firstLine = getFirstPendingTaskLine(checklistContent);
  if (!firstLine) return 1;
  return determinePhaseFromTask(firstLine, checklistContent);
}

/**
 * Identifica o número da fase de uma tarefa baseada na sua posição no checklist.
 * Percorre as seções ## Fase N para encontrar a que contém a taskLine fornecida.
 */
export function determinePhaseFromTask(taskLine: string, checklistContent: string): number {
  const lines = checklistContent.split("\n");
  const taskNorm = taskLine.trim().toLowerCase();

  let currentPhase = 1;
  let foundPhase = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    const phaseMatch = trimmed.match(/^##\s+fase\s+(\d+)/i);
    if (phaseMatch) {
      currentPhase = parseInt(phaseMatch[1], 10);
    }
    if (trimmed.toLowerCase().includes(taskNorm) || taskNorm.includes(trimmed.toLowerCase())) {
      if (trimmed.length > 5) {
        foundPhase = currentPhase;
        break;
      }
    }
  }

  return foundPhase;
}

/**
 * Aplica conclusão de fase para todas as fases: se todas as sub-tarefas de uma fase estão [x], marca o header da fase.
 */
export function applyAllPhaseCompletions(checklistContent: string): string {
  const titles = getPhaseTitles(checklistContent);
  let content = checklistContent;
  for (const { number } of titles) {
    content = applyPhaseHeaderMarkIfComplete(content, number);
  }
  return content;
}
