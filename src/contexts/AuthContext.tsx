import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, extractApiError, registerAuthErrorHandlers } from '../lib/apiClient';
import { LoginPayload, User, UserRole, sanitizeUserPayload } from '../types/auth';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authenticating: boolean;
  sessionExpired: boolean;
  authError: string | null;
  forbiddenError: string | null;
  loginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  clearErrors: () => void;
  login: (payload: LoginPayload) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  hasRole: (...roles: UserRole[]) => boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function checkUserRole(user: User | null, roles: UserRole[]): boolean {
  if (!user || !user.is_active || Boolean(user.suspended_at)) return false;
  return roles.includes(user.role);
}

export function checkUserPermission(user: User | null, permission: string): boolean {
  if (!user || !user.is_active || Boolean(user.suspended_at)) return false;
  if (user.role === 'super_admin') return true;
  if (user.permissions.includes(permission)) {
    return true;
  }

  // Support manage_<module> implying view/create/update/delete_<module>
  const parts = permission.split('_');
  if (parts.length >= 2) {
    const action = parts[0];
    const moduleName = parts.slice(1).join('_');
    if (action !== 'manage' && user.permissions.includes(`manage_${moduleName}`)) {
      return true;
    }
  }

  return false;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authenticating, setAuthenticating] = useState<boolean>(false);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [forbiddenError, setForbiddenError] = useState<string | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState<boolean>(false);

  const clearErrors = useCallback(() => {
    setAuthError(null);
    setForbiddenError(null);
    setSessionExpired(false);
  }, []);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const res = await apiClient.get('/api/me');
      const rawUser = res.data?.data ?? res.data?.user ?? res.data;
      const sanitized = sanitizeUserPayload(rawUser);

      // Fail closed: the server must explicitly identify an active account.
      if (!sanitized || sanitized.is_active !== true || Boolean(sanitized.suspended_at)) {
        setUser(null);
        setForbiddenError('The authenticated account is inactive or the server returned an invalid user profile.');
        return null;
      }

      setUser(sanitized);
      setSessionExpired(false);
      setAuthError(null);
      setForbiddenError(null);
      return sanitized;
    } catch (error) {
      const info = extractApiError(error, 'Unable to verify the server session.');
      if (info.status === 401) {
        setUser(null);
        return null;
      }
      if (info.status === 403) {
        setUser(null);
        setForbiddenError(info.message);
        setAuthError(info.message);
      } else {
        // Keep backend/network errors visible instead of silently treating an
        // unavailable API as an ordinary signed-out session.
        setAuthError(info.message);
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    // Clean up any legacy insecure token key if present
    try {
      localStorage.removeItem('admin_token');
    } catch {
      // Ignore storage access restrictions
    }

    registerAuthErrorHandlers({
      onUnauthorized: (info) => {
        setUser((prev) => {
          if (prev) {
            setSessionExpired(true);
            setAuthError(info.message || 'Your session has expired. Please sign in again.');
          }
          return null;
        });
      },
      onForbidden: (info) => {
        setForbiddenError(info.message || 'You do not have permission to perform this action.');
      },
    });

    refreshUser()
      .catch(() => undefined)
      .finally(() => {
        setLoading(false);
      });

    return () => {
      registerAuthErrorHandlers({});
    };
  }, [refreshUser]);

  const login = useCallback(
    async (payload: LoginPayload): Promise<User> => {
      setAuthenticating(true);
      setAuthError(null);
      setForbiddenError(null);
      setSessionExpired(false);

      try {
        // Initialize Laravel Sanctum CSRF cookie before authentication request
        await apiClient.get('/sanctum/csrf-cookie');

        await apiClient.post('/api/login', {
          email: payload.email.trim(),
          password: payload.password,
          remember: Boolean(payload.remember),
        });

        // Always confirm and hydrate authenticated user from backend /api/me
        const verifiedUser = await refreshUser();
        if (!verifiedUser) {
          throw new Error('The server did not confirm an active authenticated account.');
        }

        setLoginModalOpen(false);
        return verifiedUser;
      } catch (error) {
        const info = extractApiError(error, 'Authentication failed.');
        setAuthError(info.message);
        throw error;
      } finally {
        setAuthenticating(false);
      }
    },
    [refreshUser]
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      // Laravel Sanctum uses the XSRF cookie for state-changing session requests.
      // Refresh it best-effort before logout; the server may already have expired it.
      await apiClient.get('/sanctum/csrf-cookie').catch(() => undefined);
      await apiClient.post('/api/logout');
    } catch {
      // Clear client state even if the session already expired server-side.
    } finally {
      setUser(null);
      setSessionExpired(false);
      setAuthError(null);
      setForbiddenError(null);
    }
  }, []);

  const hasRole = useCallback((...roles: UserRole[]) => checkUserRole(user, roles), [user]);
  const hasPermission = useCallback(
    (permission: string) => checkUserPermission(user, permission),
    [user]
  );
  const hasAnyPermission = useCallback(
    (permissions: string[]) => permissions.some((p) => checkUserPermission(user, p)),
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authenticating,
        sessionExpired,
        authError,
        forbiddenError,
        loginModalOpen,
        openLoginModal: () => setLoginModalOpen(true),
        closeLoginModal: () => setLoginModalOpen(false),
        clearErrors,
        login,
        logout,
        refreshUser,
        hasRole,
        hasPermission,
        hasAnyPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
