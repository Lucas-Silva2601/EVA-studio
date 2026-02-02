"use client";

import { useCallback, useRef, useState } from "react";

function getStoredSize(key: string, initial: number, min: number, max: number): number {
  if (typeof window === "undefined") return initial;
  try {
    const stored = localStorage.getItem(key);
    const n = parseInt(stored ?? "", 10);
    if (!Number.isNaN(n)) return Math.min(max, Math.max(min, n));
  } catch {
    // ignore
  }
  return initial;
}

/**
 * Hook para redimensionar painéis (sidebar horizontal, painel vertical).
 * Para painel à direita (edge: "right"), arrastar a alça para a esquerda aumenta a largura.
 * Se storageKey for passado, o tamanho é salvo e restaurado do localStorage.
 */
export function useResize(
  initialSize: number,
  min: number,
  max: number,
  direction: "horizontal" | "vertical",
  /** Apenas para horizontal: "left" = alça à direita do painel; "right" = alça à esquerda. */
  edge: "left" | "right" = "left",
  /** Chave no localStorage para persistir o tamanho (ex.: "eva-sidebar-width"). */
  storageKey?: string
) {
  const [size, setSizeState] = useState(() =>
    storageKey ? getStoredSize(storageKey, initialSize, min, max) : initialSize
  );
  const isDragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  const setSize = useCallback(
    (value: number | ((prev: number) => number)) => {
      setSizeState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        const clamped = Math.min(max, Math.max(min, next));
        if (storageKey && typeof window !== "undefined") {
          try {
            localStorage.setItem(storageKey, String(clamped));
          } catch {
            // ignore
          }
        }
        return clamped;
      });
    },
    [min, max, storageKey]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;
      startSize.current = size;
    },
    [direction, size]
  );

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return;
      const current = direction === "horizontal" ? e.clientX : e.clientY;
      let delta: number;
      if (direction === "horizontal") {
        delta = edge === "right" ? startPos.current - current : current - startPos.current;
      } else {
        delta = startPos.current - current;
      }
      const newSize = startSize.current + delta;
      setSize(Math.min(max, Math.max(min, newSize)));
    },
    [direction, edge, min, max, setSize]
  );

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return { size, setSize, onMouseDown, onMouseMove, onMouseUp, isDragging };
}
