import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VaultMind - Intelligent Cloud Storage",
  description: "Secure cloud storage with AI-powered search, auto-tagging, and summarization",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("dark font-sans", geist.variable)} suppressHydrationWarning>
      <body className={`${inter.className} bg-background text-foreground min-h-screen transition-colors duration-300`}>
        <ThemeProvider>
          <AuthProvider>
            <SmoothScrollProvider>
              {children}
            </SmoothScrollProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
