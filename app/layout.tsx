import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassBy Reels — 설득형 쇼츠 자동화",
  description: "AI 기반 학원 마케팅 영상 자동 생성",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
