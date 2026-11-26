import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { checkUserPermission, checkUserRole, useAuth } from '../../contexts/AuthContext';
import { User, UserRole } from '../../types/auth';

export interface RouteAccessInput {
  user: User | null;
  loading: boolean;
  allowedRoles?: UserRole[];
  requiredPermissions?: string[];
  requireAllPermissions?: boolean;
}

export type RouteAccessDecision = 'loading' | 'unauthenticated' | 'forbidden' | 'allowed';

export function evaluateRouteAccess({
  user,
  loading,
  allowedRoles,
  requiredPermissions,
  requireAllPermissions = false,
}: RouteAccessInput): RouteAccessDecision {
  if (loading) return 'loading';
  if (!user || !user.is_active || Boolean(user.suspended_at)) return 'unauthenticated';

  if (allowedRoles && allowedRoles.length > 0 && !checkUserRole(user, allowedRoles)) {
    return 'forbidden';
  }

  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasPerm = requireAllPermissions
      ? requiredPermissions.every((p) => checkUserPermission(user, p))
      : requiredPermissions.some((p) => checkUserPermission(user, p));
    if (!hasPerm) {
      return 'forbidden';
    }
  }

  return 'allowed';
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requiredPermissions?: string[];
  requireAllPermissions?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  requiredPermissions,
  requireAllPermissions = false,
}) => {
  const { language, dir } = useLanguage();
  const { user, loading, forbiddenError } = useAuth();
  const location = useLocation();

  const decision = evaluateRouteAccess({
    user,
    loading,
    allowedRoles,
    requiredPermissions,
    requireAllPermissions,
  });

  if (decision === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center pt-20" dir={dir}>
        <div className="flex items-center gap-3 text-slate-300 text-sm font-semibold">
          <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
          <span>{language === 'ar' ? 'جارٍ التحقق من الجلسة...' : 'Verifying session...'}</span>
        </div>
      </div>
    );
  }

  if (decision === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  if (decision === 'forbidden') {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4 pt-20" dir={dir}>
        <div className="max-w-md w-full bg-slate-900/80 border border-rose-500/30 rounded-3xl p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">
            {language === 'ar' ? '403 - غير مصرح بالوصول' : '403 - Access Denied'}
          </h1>
          <p className="text-sm text-slate-400">
            {forbiddenError ||
              (language === 'ar'
                ? 'ليس لديك الصلاحية الكافية للوصول إلى هذه الصفحة.'
                : 'You do not have the required role or permissions to access this section.')}
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
