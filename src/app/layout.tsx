import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ontology/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "企业级本体平台 · Ontology Console",
  description:
    "在线治理的语义资产平台：在线编辑、版本快照、跨领域去重聚合、人能看懂的规则 DSL。",
  keywords: [
    "Ontology",
    "本体平台",
    "Rule DSL",
    "SHACL",
    "知识图谱",
    "企业治理",
  ],
  authors: [{ name: "Platform Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <SonnerToaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
