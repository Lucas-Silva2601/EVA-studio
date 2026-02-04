import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "vscode-bg": "#1e1e1e",
        "vscode-sidebar": "#252526",
        "vscode-sidebar-hover": "#2a2d2e",
        "vscode-editor": "#1e1e1e",
        "vscode-panel": "#181818",
        "vscode-border": "#3c3c3c",
        "vscode-titlebar": "#323233",
        "vscode-accent": "#0e639c",
        "vscode-accent-hover": "#1177bb",
        /* Cores de estado (Output, Chat) – consistência visual */
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
