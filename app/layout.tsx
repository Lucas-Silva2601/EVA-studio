import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EVA Studio - IDE Autônoma",
  description: "IDE baseada na web com agentes de IA (Analista e Programador)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-vscode-bg text-gray-200 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
