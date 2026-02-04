"use client";

import { parseFilenameFromCodeBlock, stripFilenameComment } from "@/lib/markdownCodeParser";

export interface ChatCodeBlockProps {
  /** Conteúdo Markdown da mensagem do assistente (pode conter blocos ``` com // FILE:). */
  content: string;
  /** Chamado ao clicar no botão de ação com (filePath, proposedContent) — um bloco. */
  onImplement: (filePath: string, proposedContent: string) => void;
  /** Chamado ao clicar em "Implementar" quando há múltiplos arquivos na mensagem (Entrega de Fase). */
  onImplementAll?: (files: { filePath: string; content: string }[]) => void;
  /** Classe CSS para o container do texto (ex: text-zinc-50). */
  className?: string;
  /** Rótulo do botão (ex.: "Implementar Mudanças" ou "Aplicar Autocura"). */
  buttonLabel?: string;
}

/**
 * Segmento: texto ou bloco de código com path opcional.
 */
type Segment = { type: "text"; value: string } | { type: "code"; lang: string; raw: string; filePath: string | null; contentWithoutFile: string };

function parseSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  const fenceRegex = /^```(\w*)\s*\n([\s\S]*?)\n```/gm;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(content)) !== null) {
    const before = content.slice(lastIndex, match.index);
    if (before.length > 0) segments.push({ type: "text", value: before });
    const lang = match[1]?.trim() ?? "";
    const raw = match[2]?.trim() ?? "";
    const filePath = parseFilenameFromCodeBlock(raw);
    const contentWithoutFile = filePath ? stripFilenameComment(raw) : raw;
    segments.push({ type: "code", lang, raw, filePath, contentWithoutFile });
    lastIndex = match.index + match[0].length;
  }
  const tail = content.slice(lastIndex);
  if (tail.length > 0) segments.push({ type: "text", value: tail });
  return segments;
}

/**
 * Renderiza a mensagem do assistente: texto + blocos de código com botão "Implementar Mudanças" quando há // FILE:.
 */
export function ChatCodeBlock({
  content,
  onImplement,
  onImplementAll,
  className = "",
  buttonLabel = "Implementar Mudanças",
}: ChatCodeBlockProps) {
  const segments = parseSegments(content);
  const codeBlocksWithFile = segments.filter(
    (s): s is Segment & { type: "code"; filePath: string } =>
      s.type === "code" && s.filePath != null
  );
  const multiFile = onImplementAll != null && codeBlocksWithFile.length >= 2;

  return (
    <div className={`whitespace-pre-wrap break-words text-ds-text-primary ${className}`}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={i}>{seg.value}</span>;
        }
        return (
          <div key={i} className="my-2 rounded border border-vscode-border bg-vscode-bg/60 overflow-hidden">
            {seg.filePath && (
              <div className="px-2 py-1 text-[10px] text-gray-400 border-b border-vscode-border font-mono">
                {seg.filePath}
              </div>
            )}
            <pre className="p-2 overflow-x-auto text-xs font-mono text-zinc-50 max-h-[280px] overflow-y-auto">
              <code>{seg.raw}</code>
            </pre>
            {seg.filePath && !multiFile && (
              <div className="px-2 py-1.5 border-t border-vscode-border">
                <button
                  type="button"
                  onClick={() => onImplement(seg.filePath!, seg.contentWithoutFile)}
                  className="rounded bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 text-xs font-medium focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
                  aria-label={buttonLabel}
                >
                  {buttonLabel}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {multiFile && codeBlocksWithFile.length > 0 && (
        <div className="mt-2 px-2 py-1.5 rounded border border-vscode-border bg-vscode-bg/80">
          <button
            type="button"
            onClick={() =>
              onImplementAll?.(
                codeBlocksWithFile.map((s) => ({
                  filePath: s.filePath,
                  content: s.contentWithoutFile,
                }))
              )
            }
            className="rounded bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 text-xs font-medium focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
            aria-label={buttonLabel}
          >
            {buttonLabel} ({codeBlocksWithFile.length} arquivos)
          </button>
        </div>
      )}
    </div>
  );
}
