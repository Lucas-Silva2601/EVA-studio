/**
 * Tipos globais da IDE EVA Studio.
 */

export interface FileNode {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: FileNode[];
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  language?: string;
}

export type OutputMessage = {
  id: string;
  type: "info" | "success" | "warning" | "error";
  text: string;
  timestamp: Date;
};

/** Resultado da análise do checklist pelo Agente Analista (Groq). */
export interface ChecklistAnalysisResult {
  /** Próxima tarefa pendente (texto da linha com [ ]). */
  taskDescription: string;
  /** Linha exata ou bloco no checklist (para depois marcar [x]). */
  taskLine?: string;
  /** Sugestão de arquivo ou escopo (ex.: "components/Login.tsx"). */
  suggestedFile?: string;
  /** Tecnologia sugerida (ex.: "React", "Python"). */
  suggestedTech?: string;
}

/** Resultado da validação de um arquivo pelo Analista. */
export interface ValidationResult {
  approved: boolean;
  reason?: string;
  /** Linha do checklist a ser atualizada ([ ] -> [x]). */
  taskLineToMark?: string;
}

/** Estado do loop de automação (Executar próxima tarefa). */
export type LoopStatus =
  | "idle"
  | "validating"
  | "error"
  | "awaiting_review";

/** Um arquivo em revisão (diff). */
export interface PendingDiffFile {
  filePath: string;
  beforeContent: string | null;
  afterContent: string;
}

/** Fase 9/10: Pendência de revisão humana antes de salvar arquivo(s) gerado(s) pela IA. */
export interface PendingDiffReview {
  /** Lista de arquivos (Fase 10: múltiplos; Fase 9: um único). */
  files: PendingDiffFile[];
  /** Descrição da tarefa do checklist (para validação após aceitar). */
  taskDescription: string;
  /** Resultado da análise (para atualizar checklist após aceitar). Obrigatório quando origem é loop; vazio quando origem é chat. */
  checklistResult: ChecklistAnalysisResult;
  /** true quando a sugestão veio do chat (Implementar); nesse caso não valida checklist. */
  fromChat?: boolean;
  /** Linhas do checklist a marcar [x] em massa (Entrega de Fase). */
  phaseLines?: string[];
}
