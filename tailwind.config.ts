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
        /* Tokens semânticos (Design System) */
        "ds-bg-primary": "#1e1e1e",
        "ds-bg-secondary": "#181818",
        "ds-surface": "#252526",
        "ds-surface-hover": "#2a2d2e",
        "ds-surface-elevated": "#323233",
        "ds-border": "#3c3c3c",
        "ds-accent": "#0e639c",
        "ds-accent-hover": "#1177bb",
        "ds-text-primary": "#e5e5e5",
        "ds-text-secondary": "#a3a3a3",
        "ds-text-muted": "#737373",
        "ds-text-info": "#d1d5db",
        "ds-text-success": "#4ade80",
        "ds-text-warning": "#facc15",
        "ds-text-error": "#f87171",
        /* Aliases vscode-* (retrocompatibilidade) */
        "vscode-bg": "#1e1e1e",
        "vscode-sidebar": "#252526",
        "vscode-sidebar-hover": "#2a2d2e",
        "vscode-editor": "#1e1e1e",
        "vscode-panel": "#181818",
        "vscode-border": "#3c3c3c",
        "vscode-titlebar": "#323233",
        "vscode-input": "#2d2d2d",
        "vscode-accent": "#0e639c",
        "vscode-accent-hover": "#1177bb",
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
