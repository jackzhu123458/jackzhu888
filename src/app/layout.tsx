import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { AppShell } from '@/components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '仓库进销存管理系统',
    template: '%s | 仓库进销存管理系统',
  },
  description: '仓库进销存管理系统 - BOM管理、生产订单、送货单打印、标签打印',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
