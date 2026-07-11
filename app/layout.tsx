import type { Metadata } from "next";
import "antd/dist/reset.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "TalknDo | talk and do",
  description: "Commit to a challenge, prove the work, and earn an on-chain badge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col"><Providers>{children}</Providers></body>
    </html>
  );
}
