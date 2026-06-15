'use client';

import { useEffect } from 'react';
import { Sidebar } from '@/components/sidebar';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthProvider, useAuth } from '@/components/auth-context';
import { usePathname, useRouter } from 'next/navigation';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (!loading && !user && !isLoginPage) {
      router.replace('/login');
    }
  }, [loading, user, isLoginPage, router]);

  // 登录页：已登录则跳转首页
  useEffect(() => {
    if (!loading && user && isLoginPage) {
      router.replace('/');
    }
  }, [loading, user, isLoginPage, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="text-[#6B7280]">加载中...</div>
      </div>
    );
  }

  // 未登录且非登录页，显示加载
  if (!user && !isLoginPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="text-[#6B7280]">正在跳转登录...</div>
      </div>
    );
  }

  // 登录页：未登录或正在跳转
  if (isLoginPage) {
    return <>{children}</>;
  }

  // 已登录：显示侧边栏 + 内容
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <Sidebar />
      <main className="ml-[240px] min-h-screen">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>
        {children}
      </AuthGuard>
    </AuthProvider>
  );
}
