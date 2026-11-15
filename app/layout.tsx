import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "מתכונים חכמים",
  description: "חיפוש מתכונים, תרגום לעברית, התאמת כמויות ורשימות קניות.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
