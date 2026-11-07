import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "时光小屋 · Our Little Space",
  description: "把平凡的日子，收藏成我们的故事。两位朋友的私人共享回忆空间",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f7f9",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
