import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  return {
    metadataBase: base,
    title: "森灵消消乐｜森林主题三消游戏",
    description: "交换森林精灵，触发连锁消除，在有限步数内唤醒萤光森林。",
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: "森灵消消乐",
      description: "交换 · 连击 · 点亮森林",
      type: "website",
      images: [{ url: "/og.png", width: 1728, height: 910, alt: "森灵消消乐游戏棋盘" }],
    },
    twitter: { card: "summary_large_image", title: "森灵消消乐", description: "交换 · 连击 · 点亮森林", images: ["/og.png"] },
  };
}
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}