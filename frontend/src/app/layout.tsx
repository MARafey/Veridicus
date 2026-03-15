import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
import antdTheme from "@/theme/antdTheme";
import logo from "./logo.png";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veridicus",
  description:
    "Authenticate resume claims with AI-powered technical assessments",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <head>
        <link rel="icon" href={logo.src} type="image/png" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@900,800,700,500,400,300&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <AntdRegistry>
          <ConfigProvider theme={antdTheme}>{children}</ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
