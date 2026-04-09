import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "내부 문서 점검 플랫폼",
  description: "문서 업로드 후 일회성 검토 결과를 확인하고 PDF로 저장하는 내부 서비스"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
