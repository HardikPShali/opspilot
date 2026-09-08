import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpsPilot | Incident Operations Workbench",
  description: "A working operations dashboard for incident response, service health and accountable decisions.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
