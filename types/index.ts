/**
 * Tipos globais da IDE EVA Studio.
 * Contratos da extensão (CodeResponsePayload, ErrorPayload) estão em lib/messaging.ts e são re-exportados abaixo para referência do protocolo (docs/protocolo-extensao-ide, Fase 4).
 */
export type {
  CodeResponsePayload,
  ErrorPayload,
  ExtensionMessageType,
  ExtensionMessagePayload,
  WaitForCodeResult,
  WaitForCodeError,
} from "@/lib/messaging";

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
  /** true quando há alterações não salvas */
  isDirty?: boolean;
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
  /** Quando aprovado, a IDE deve marcar a tarefa no checklist. */
  action?: "MARK_COMPLETE";
  /** Número da linha (1-based) no checklist.md para marcar; opcional se taskLineToMark estiver presente. */
  line?: number;
}

/** Estado do loop de automação (Executar próxima tarefa). */
export type LoopStatus =
  | "idle"
  | "validating"
  | "error";

