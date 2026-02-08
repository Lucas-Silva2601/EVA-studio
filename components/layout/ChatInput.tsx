"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, ImagePlus, Infinity, X, Loader2 } from "lucide-react";
import type { ChatProvider } from "@/lib/groq";

const MAX_HEIGHT = 200;
const ACCEPT_IMAGE = "image/png,image/jpeg,image/webp,image/gif";

export type ChatInputImage = { dataUrl: string; base64: string; mimeType: string; name: string };

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (images: ChatInputImage[]) => void;
  disabled?: boolean;
  loading?: boolean;
  chatProvider: ChatProvider;
  onChatProviderChange: (p: ChatProvider) => void;
  images: ChatInputImage[];
  onImagesChange: (images: ChatInputImage[]) => void;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  loading = false,
  chatProvider,
  onChatProviderChange,
  images,
  onImagesChange,
  placeholder = "Mensagem para o Analista...",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend(images);
    }
  };

  const handleSendClick = () => onSend(images);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    let loaded = 0;
    const toAdd: ChatInputImage[] = [];
    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1] ?? "";
        toAdd.push({ dataUrl, base64, mimeType: file.type, name: file.name });
        loaded++;
        if (loaded === imageFiles.length) {
          onImagesChange([...images, ...toAdd]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeImage = (idx: number) => {
    onImagesChange(images.filter((_, i) => i !== idx));
  };

  const hasImages = images.length > 0;
  const canSend = (value.trim().length > 0 || hasImages) && !disabled;

  return (
    <div className="flex flex-col gap-2">
      {hasImages && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, idx) => (
            <div
              key={idx}
              className="relative rounded border border-ds-border-light dark:border-ds-border overflow-hidden group"
            >
              <img
                src={img.dataUrl}
                alt={img.name}
                className="h-14 w-14 object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute top-0.5 right-0.5 rounded-full bg-black/70 text-white p-0.5 hover:bg-red-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remover imagem"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5 items-end rounded-lg border border-ds-border-light dark:border-ds-border bg-[var(--vscode-input)] focus-within:ring-1 focus-within:ring-ds-accent-neon transition-all duration-200">
        <div className="flex items-center gap-0.5 pl-2 pb-1.5 shrink-0">
          <div className="relative">
            <button
              type="button"
              onClick={() => setPopoverOpen((o) => !o)}
              className="rounded p-1 text-ds-text-secondary-light dark:text-ds-text-secondary hover:text-ds-accent-neon hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon disabled:opacity-50"
              aria-label="Selecionar modelo de IA"
              title="Modelo de IA"
            >
              <Infinity className="w-4 h-4" />
            </button>
            {popoverOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={() => setPopoverOpen(false)}
                />
                <div
                  className="absolute bottom-full left-0 mb-1 z-20 rounded-lg border border-ds-border-light dark:border-ds-border bg-ds-surface-light dark:bg-ds-surface shadow-lg py-1 min-w-[160px]"
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onChatProviderChange("groq");
                      setPopoverOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs font-medium focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon ${
                      chatProvider === "groq"
                        ? "bg-ds-accent-neon/20 text-ds-accent-neon"
                        : "text-ds-text-primary-light dark:text-ds-text-primary hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover"
                    }`}
                  >
                    Groq (Analista)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onChatProviderChange("gemini");
                      setPopoverOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs font-medium focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon ${
                      chatProvider === "gemini"
                        ? "bg-ds-accent-neon/20 text-ds-accent-neon"
                        : "text-ds-text-primary-light dark:text-ds-text-primary hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover"
                    }`}
                  >
                    Gemini 2.0 Flash
                  </button>
                </div>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_IMAGE}
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded p-1 text-ds-text-secondary-light dark:text-ds-text-secondary hover:text-ds-accent-neon hover:bg-ds-surface-hover-light dark:hover:bg-ds-surface-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon disabled:opacity-50"
            aria-label="Enviar imagem"
            title="Enviar imagem (usa Gemini)"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className="flex-1 min-w-0 resize-none overflow-y-auto bg-transparent px-2 py-2 text-sm text-ds-text-primary-light dark:text-ds-text-primary placeholder-ds-text-muted-light dark:placeholder-ds-text-muted focus:outline-none border-0 focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-ds-border-light dark:[&::-webkit-scrollbar-thumb]:bg-ds-border"
          style={{
            maxHeight: MAX_HEIGHT,
            transition: "height 0.2s ease",
          }}
          aria-label="Mensagem do chat"
        />
        <button
          type="button"
          onClick={handleSendClick}
          disabled={!canSend}
          className="shrink-0 rounded bg-ds-accent-light dark:bg-ds-accent-neon text-white dark:text-gray-900 p-1.5 mb-1.5 mr-1.5 hover:bg-ds-accent-light-hover dark:hover:bg-ds-accent-neon-hover shadow-[var(--ds-glow-neon)] focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon focus-visible:ring-offset-1 focus-visible:ring-offset-ds-surface-light dark:focus-visible:ring-offset-ds-surface disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-ds-surface-light dark:disabled:bg-ds-surface disabled:text-ds-text-muted-light dark:disabled:text-ds-text-muted disabled:shadow-none"
          aria-label="Enviar mensagem"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
