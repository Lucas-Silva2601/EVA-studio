import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EVA Studio - IDE Autônoma",
  description: "IDE baseada na web com agentes de IA (Analista e Programador)",
};

/**
 * Script inline no head para evitar FOUC (flash of unstyled content).
 * Aplica class="dark" no <html> antes do primeiro paint, respeitando
 * localStorage.theme e prefers-color-scheme.
 */
const themeScript = `
(function() {
  const isDark = localStorage.theme === 'dark' ||
    (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeScript }}
          suppressHydrationWarning
        />
      </head>
      <body className="bg-vscode-bg text-gray-200 antialiased min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
