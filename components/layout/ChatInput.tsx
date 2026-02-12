"use client";

import { useRef, useEffect, useCallback } from "react";
import { Send, ImagePlus, X, Loader2, Square } from "lucide-react";

const MAX_HEIGHT = 200;
const ACCEPT_IMAGE = "image/png,image/jpeg,image/webp,image/gif";

export type ChatInputImage = { dataUrl: string; base64: string; mimeType: string; name: string };

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (images: ChatInputImage[]) => void;
  disabled?: boolean;
  loading?: boolean;
  images: ChatInputImage[];
  onImagesChange: (images: ChatInputImage[]) => void;
  placeholder?: string;
  /** Exibe botão "Interromper" quando a resposta está sendo gerada. */
  showStopButton?: boolean;
  onStop?: () => void;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  loading = false,
  images,
  onImagesChange,
  placeholder = "Mensagem para o Analista...",
  showStopButton = false,
  onStop,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const addImageFiles = useCallback(
    (files: File[]) => {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
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
    },
    [images, onImagesChange]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    addImageFiles(Array.from(files));
    e.target.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.files;
    if (!items?.length) return;
    const files = Array.from(items).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    e.preventDefault();
    addImageFiles(files);
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
            title="Anexar imagem para o Analista (Groq) analisar"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
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
        {showStopButton && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded bg-ds-surface-hover-light dark:bg-ds-surface-hover text-ds-text-primary-light dark:text-ds-text-primary p-1.5 mb-1.5 mr-1.5 hover:bg-ds-text-error/10 hover:text-ds-text-error focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon"
            aria-label="Interromper resposta"
            title="Interromper resposta"
          >
            <Square className="w-4 h-4" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleSendClick}
          disabled={!canSend}
          className="shrink-0 rounded bg-ds-accent-light dark:bg-ds-accent-neon text-white dark:text-gray-900 p-1.5 mb-1.5 mr-1.5 hover:bg-ds-accent-light-hover dark:hover:bg-ds-accent-neon-hover shadow-[var(--ds-glow-neon)] focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent-neon focus-visible:ring-offset-1 focus-visible:ring-offset-ds-surface-light dark:focus-visible:ring-offset-ds-surface disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-ds-surface-light dark:disabled:bg-ds-surface disabled:text-ds-text-muted-light dark:disabled:text-ds-text-muted disabled:shadow-none"
          aria-label="Enviar mensagem"
        >
          {loading && !showStopButton ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
