import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EVA Studio - IDE Autônoma",
  description: "IDE baseada na web com agentes de IA (Analista e Programador)",
};

/**
 * Script inline no head para evitar FOUC (flash of unstyled content).
 * Aplica ou remove class="dark" no <html> antes do primeiro paint:
 * - localStorage.theme === 'dark' → dark
 * - localStorage.theme === 'light' → light (remove dark)
 * - Sem preferência salva → respeita prefers-color-scheme
 */
const themeScript = `
(function() {
  const stored = localStorage.theme;
  const isDark = stored === 'dark' ||
    (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
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
      <body className="antialiased min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
