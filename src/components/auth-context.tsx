'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AuthState {
  user: { id: string; username: string; display_name: string; phone?: string; email?: string } | null;
  roles: { id: string; code: string; name: string }[];
  permissions: string[];
  token: string | null;
  loading: boolean;
  isAdmin: boolean;
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    roles: [],
    permissions: [],
    token: null,
    loading: true,
    isAdmin: false,
  });

  // 从localStorage恢复登录态
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      fetchAuth(token);
    } else {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  const fetchAuth = async (token: string) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setState({
          user: data.user,
          roles: data.roles || [],
          permissions: data.permissions || [],
          token,
          loading: false,
          isAdmin: (data.roles || []).some((r: Record<string, unknown>) => r.code === 'admin'),
        });
      } else {
        localStorage.removeItem('auth_token');
        setState(prev => ({ ...prev, token: null, loading: false }));
      }
    } catch {
      localStorage.removeItem('auth_token');
      setState(prev => ({ ...prev, token: null, loading: false }));
    }
  };

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '登录失败');

    localStorage.setItem('auth_token', data.token);
    setState({
      user: data.user,
      roles: data.roles || [],
      permissions: data.permissions || [],
      token: data.token,
      loading: false,
      isAdmin: (data.roles || []).some((r: Record<string, unknown>) => r.code === 'admin'),
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setState({
      user: null,
      roles: [],
      permissions: [],
      token: null,
      loading: false,
      isAdmin: false,
    });
  }, []);

  const hasPermission = useCallback((code: string) => {
    if (state.isAdmin) return true;
    return state.permissions.includes(code);
  }, [state.permissions, state.isAdmin]);

  const hasAnyPermission = useCallback((codes: string[]) => {
    if (state.isAdmin) return true;
    return codes.some(c => state.permissions.includes(c));
  }, [state.permissions, state.isAdmin]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, hasPermission, hasAnyPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
