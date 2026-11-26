import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import LoginForm from '../components/auth/LoginForm';

function defaultAuthenticatedPath(role: string, permissions: string[]): string {
  if (role === 'client') return '/client';
  if (role === 'super_admin') return '/dashboard';

  const can = (permission: string) => permissions.includes(permission) || permissions.includes(`manage_${permission.replace(/^(view|create|update|delete)_/, '')}`);
  if (can('view_stats')) return '/dashboard';
  if (can('view_leads')) return '/dashboard/bookings';
  if (can('view_clients')) return '/dashboard/clients';
  if (can('view_projects')) return '/dashboard/projects';
  if (can('view_billing')) return '/dashboard/billing';
  if (can('view_messages')) return '/dashboard/messages';
  if (can('view_team') || can('create_team') || can('update_team') || can('manage_team')) return '/dashboard/team';
  if (can('view_settings')) return '/dashboard/settings';
  return '/dashboard/profile';
}

function canVisitRequestedPath(user: { role: string; permissions: string[] }, path: string): boolean {
  if (path === '/dashboard/profile') return true;
  if (path === '/client') return user.role === 'client';
  if (path === '/dashboard') return user.role === 'super_admin' || checkUserPermissionForRoute(user, ['view_stats', 'manage_stats']);
  if (user.role === 'super_admin') return path.startsWith('/dashboard/');
  if (user.role !== 'custom_admin') return false;

  const required: Record<string, string[]> = {
    '/dashboard/bookings': ['view_leads', 'manage_leads'],
    '/dashboard/clients': ['view_clients', 'manage_clients'],
    '/dashboard/projects': ['view_projects', 'manage_projects'],
    '/dashboard/billing': ['view_billing', 'manage_billing'],
    '/dashboard/messages': ['view_messages', 'manage_messages'],
    '/dashboard/team': ['view_team', 'create_team', 'update_team', 'manage_team'],
    '/dashboard/settings': ['view_settings', 'manage_settings'],
  };
  const permissionsForPath = required[path];
  return Boolean(permissionsForPath?.some((permission) => checkUserPermissionForRoute(user, [permission])));
}

function checkUserPermissionForRoute(
  user: { role: string; permissions: string[] },
  permissions: string[]
): boolean {
  if (user.role === 'super_admin') return true;
  return permissions.some((permission) => {
    if (user.permissions.includes(permission)) return true;
    const [action, ...moduleParts] = permission.split('_');
    return action !== 'manage' && moduleParts.length > 0 && user.permissions.includes(`manage_${moduleParts.join('_')}`);
  });
}

const LoginPage: React.FC = () => {
  const { language, dir } = useLanguage();
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const requestedFrom = (location.state as { from?: string } | null)?.from;
  const from = typeof requestedFrom === 'string' && requestedFrom.startsWith('/') && !requestedFrom.startsWith('//') && requestedFrom !== '/login'
    ? requestedFrom
    : null;
  const landingPath = user ? defaultAuthenticatedPath(user.role, user.permissions) : '/dashboard';
  const redirectPath = user && from && canVisitRequestedPath(user, from) ? from : landingPath;

  if (!loading && user) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4 pt-28 pb-20" dir={dir}>
      <div className="w-full max-w-md glass-card rounded-3xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">
              {language === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
            </h1>
            <p className="text-xs text-slate-400">
              {language === 'ar'
                ? 'أدخل بيانات حسابك للوصول إلى لوحة التحكم'
                : 'Enter your credentials to access your portal'}
            </p>
          </div>
        </div>

        <LoginForm
          onSuccess={(authenticatedUser) => {
            const target = from && canVisitRequestedPath(authenticatedUser, from)
              ? from
              : defaultAuthenticatedPath(authenticatedUser.role, authenticatedUser.permissions);
            navigate(target, { replace: true });
          }}
        />
      </div>
    </main>
  );
};

export default LoginPage;
