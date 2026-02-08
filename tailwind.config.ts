import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Consolas",
          "Liberation Mono",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        /* Tokens semânticos (Design System) — Cyber-Heat */
        "ds-bg-primary": "#0D0D0F",
        "ds-bg-secondary": "#121217",
        "ds-surface": "#18181b",
        "ds-surface-hover": "#1f1f23",
        "ds-surface-elevated": "#27272a",
        "ds-border": "#3c3c3c",
        "ds-accent": "#FF4D4D",
        "ds-accent-hover": "#FF6B6B",
        "ds-accent-neon": "#FF4D4D",
        "ds-accent-neon-hover": "#FF6B6B",
        "ds-text-primary": "#F1F3F5",
        "ds-text-secondary": "#a3a3a3",
        "ds-text-muted": "#737373",
        "ds-text-info": "#d1d5db",
        "ds-text-success": "#4ade80",
        "ds-text-warning": "#facc15",
        "ds-text-error": "#f87171",
        /* Tokens tema claro (Fase 3) */
        "ds-bg-primary-light": "#f6f8fa",
        "ds-bg-secondary-light": "#eaeef2",
        "ds-surface-light": "#ffffff",
        "ds-surface-hover-light": "#f0f2f5",
        "ds-surface-elevated-light": "#f0f0f0",
        "ds-border-light": "#d0d7de",
        "ds-accent-light": "#00aa44",
        "ds-accent-light-hover": "#00c044",
        "ds-text-primary-light": "#24292f",
        "ds-text-secondary-light": "#57606a",
        "ds-text-muted-light": "#8b949e",
        /* Aliases vscode-* (retrocompatibilidade) */
        "vscode-bg": "#0D0D0F",
        "vscode-sidebar": "#18181b",
        "vscode-sidebar-hover": "#1f1f23",
        "vscode-editor": "#0D0D0F",
        "vscode-panel": "#121217",
        "vscode-border": "#3c3c3c",
        "vscode-titlebar": "#27272a",
        "vscode-input": "#1a1a1d",
        "vscode-accent": "#FF4D4D",
        "vscode-accent-hover": "#FF6B6B",
        "vscode-accent-neon": "#FF4D4D",
        "vscode-msg-info": "#d1d5db",
        "vscode-msg-success": "#4ade80",
        "vscode-msg-warning": "#facc15",
        "vscode-msg-error": "#f87171",
      },
    },
  },
  plugins: [],
};

export default config;
