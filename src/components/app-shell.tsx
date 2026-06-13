'use client';

import { Sidebar } from '@/components/sidebar';
import { ErrorBoundary } from '@/components/error-boundary';

export function AppShell({ children }: { children: React.ReactNode }) {
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
