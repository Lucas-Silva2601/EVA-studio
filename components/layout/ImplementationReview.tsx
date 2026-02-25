"use client";

import { useState } from "react";
import { X, Check, AlertCircle, FileCode, Code, Play } from "lucide-react";
import { useIdeState } from "@/hooks/useIdeState";
import { type EvaAction } from "@/lib/evaActions";

interface ImplementationReviewProps {
    actions: EvaAction[];
    onConfirm: () => void;
    onCancel: () => void;
}

export function ImplementationReview({ actions, onConfirm, onCancel }: ImplementationReviewProps) {
    const [confirmed, setConfirmed] = useState<Set<number>>(new Set());

    const toggleConfirm = (idx: number) => {
        const next = new Set(confirmed);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        setConfirmed(next);
    };

    return (
        <div className="absolute inset-0 z-50 flex flex-col bg-ds-bg-primary border-l border-ds-border animate-in slide-in-from-right duration-300 overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-4 py-4 border-b border-ds-border flex items-center justify-between bg-ds-surface/50 backdrop-blur-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 bg-ds-accent-neon/10 rounded-lg shrink-0 border border-ds-accent-neon/20">
                        <Code className="w-4 h-4 text-ds-accent-neon" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold text-ds-text-primary truncate">Revisar Ações</h2>
                        <p className="text-[10px] text-ds-text-secondary truncate">Mudanças sugeridas via [EVA_ACTION].</p>
                    </div>
                </div>
                <button
                    onClick={onCancel}
                    className="p-1.5 hover:bg-ds-surface-hover rounded-full transition-colors text-ds-text-secondary hover:text-ds-text-primary shrink-0"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Action List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-ds-bg-primary/50 scrollbar-thin scrollbar-thumb-ds-border">
                {actions.map((action, idx) => (
                    <div key={idx} className="border border-ds-border/50 rounded-xl overflow-hidden bg-ds-surface/30">
                        <div className="px-3 py-2.5 bg-ds-surface/50 flex items-center justify-between border-b border-white/[0.03]">
                            <div className="flex items-center gap-2 min-w-0">
                                <FileCode className="w-3.5 h-3.5 text-ds-accent-neon shrink-0" />
                                <span className="text-[11px] font-bold text-ds-text-primary truncate">
                                    {'path' in action ? action.path : ('from' in action ? `${action.from} -> ${action.to}` : action.action)}
                                </span>
                            </div>
                            <span className="text-[8px] px-2 py-0.5 rounded-full bg-ds-accent-neon text-white uppercase font-black tracking-tighter shrink-0 ml-2 shadow-[0_0_10px_rgba(255,77,77,0.3)]">
                                {action.action.replace('_', ' ')}
                            </span>
                        </div>

                        <div className="p-3 bg-ds-bg-primary/40">
                            {action.action === "PATCH_FILE" ? (
                                <div className="space-y-2.5">
                                    <div className="space-y-1">
                                        <span className="text-[9px] uppercase font-black text-ds-accent-neon/80 tracking-widest pl-1">Remover:</span>
                                        <pre className="text-[10px] p-2.5 bg-ds-accent-neon/5 border border-ds-accent-neon/20 rounded-lg text-ds-accent-neon overflow-x-auto font-mono scrollbar-none">
                                            {action.search}
                                        </pre>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[9px] uppercase font-black text-ds-text-success/80 tracking-widest pl-1">Adicionar:</span>
                                        <pre className="text-[10px] p-2.5 bg-ds-text-success/5 border border-ds-text-success/20 rounded-lg text-ds-text-success overflow-x-auto font-mono scrollbar-none">
                                            {action.replace}
                                        </pre>
                                    </div>
                                </div>
                            ) : action.action === "CREATE_FILE" ? (
                                <div className="space-y-1">
                                    <span className="text-[9px] uppercase font-black text-ds-text-success/80 tracking-widest pl-1">Conteúdo:</span>
                                    <pre className="text-[10px] p-2.5 bg-ds-text-success/5 border border-ds-text-success/20 rounded-lg text-ds-text-success/80 overflow-x-auto max-h-40 font-mono scrollbar-none">
                                        {action.content}
                                    </pre>
                                </div>
                            ) : (
                                <div className="text-[10px] text-ds-text-secondary italic p-1 bg-black/20 rounded border border-white/[0.05]">
                                    Ação: {action.action}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-5 border-t border-ds-border bg-ds-surface/80 backdrop-blur-md flex flex-col gap-3.5">
                <div className="flex items-start gap-2.5 text-ds-text-secondary text-[10px] leading-tight bg-ds-bg-primary/50 p-2.5 rounded-xl border border-ds-border/50">
                    <AlertCircle className="w-4 h-4 text-ds-accent-neon shrink-0 mt-0.5 animate-pulse" />
                    <span>Atenção: Estas ações modificarão a estrutura do projeto permanentemente.</span>
                </div>
                <div className="flex items-center gap-2.5">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2.5 text-xs font-bold text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-hover border border-ds-border rounded-xl transition-all active:scale-95"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2.5 bg-ds-accent-neon hover:bg-ds-accent-neon-hover text-white text-xs font-black rounded-xl transition-all shadow-[0_4px_20px_rgba(255,77,77,0.2)] active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Implementar
                    </button>
                </div>
            </div>
        </div>
    );
}
