import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CalendarCheck,
  Settings as SettingsIcon,
  Users,
  UserCircle,
  LogOut,
  AlertTriangle,
  Briefcase,
  Building2,
  FolderKanban,
  Receipt,
  MessageSquare,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { checkUserPermission, useAuth } from '../../contexts/AuthContext';
import { User } from '../../types/auth';

export interface DashboardNavItem {
  id: string;
  to: string;
  label_ar: string;
  label_en: string;
}

export function getAuthorizedNavItems(user: User | null): DashboardNavItem[] {
  if (!user || !user.is_active || Boolean(user.suspended_at)) {
    return [];
  }

  const items: DashboardNavItem[] = [];

  if (user.role === 'client') {
    items.push(
      { id: 'client-portal', to: '/client', label_ar: 'حسابي وطلباتي', label_en: 'My Account' },
      { id: 'profile', to: '/dashboard/profile', label_ar: 'الملف الشخصي', label_en: 'Profile' }
    );
    return items;
  }

  if (
    user.role === 'super_admin' ||
    checkUserPermission(user, 'view_stats') ||
    checkUserPermission(user, 'manage_stats')
  ) {
    items.push({ id: 'stats', to: '/dashboard', label_ar: 'الإحصائيات', label_en: 'Stats' });
  }

  if (
    user.role === 'super_admin' ||
    checkUserPermission(user, 'view_leads') ||
    checkUserPermission(user, 'manage_leads')
  ) {
    items.push({
      id: 'bookings',
      to: '/dashboard/bookings',
      label_ar: 'الحجوزات والعملاء',
      label_en: 'Leads & Bookings',
    });
  }

  if (
    user.role === 'super_admin' ||
    checkUserPermission(user, 'view_clients') ||
    checkUserPermission(user, 'manage_clients')
  ) {
    items.push({
      id: 'clients',
      to: '/dashboard/clients',
      label_ar: 'حسابات العملاء',
      label_en: 'Clients',
    });
  }

  if (
    user.role === 'super_admin' ||
    checkUserPermission(user, 'view_projects') ||
    checkUserPermission(user, 'manage_projects')
  ) {
    items.push({
      id: 'projects',
      to: '/dashboard/projects',
      label_ar: 'المشاريع',
      label_en: 'Projects',
    });
  }

  if (
    user.role === 'super_admin' ||
    checkUserPermission(user, 'view_billing') ||
    checkUserPermission(user, 'manage_billing')
  ) {
    items.push({
      id: 'billing',
      to: '/dashboard/billing',
      label_ar: 'الفواتير والمدفوعات',
      label_en: 'Billing & Invoices',
    });
  }

  if (
    user.role === 'super_admin' ||
    checkUserPermission(user, 'view_messages') ||
    checkUserPermission(user, 'manage_messages')
  ) {
    items.push({
      id: 'messages',
      to: '/dashboard/messages',
      label_ar: 'الرسائل',
      label_en: 'Messages',
    });
  }

  // Team navigation is exposed only when the server-issued role/permissions
  // include at least one team capability. The Laravel API still enforces each action.
  if (
    user.role === 'super_admin' ||
    checkUserPermission(user, 'view_team') ||
    checkUserPermission(user, 'create_team') ||
    checkUserPermission(user, 'update_team') ||
    checkUserPermission(user, 'manage_team')
  ) {
    items.push({
      id: 'team',
      to: '/dashboard/team',
      label_ar: 'إدارة الفريق',
      label_en: 'Team & Roles',
    });
  }

  if (
    user.role === 'super_admin' ||
    checkUserPermission(user, 'view_settings') ||
    checkUserPermission(user, 'manage_settings')
  ) {
    items.push({
      id: 'settings',
      to: '/dashboard/settings',
      label_ar: 'الإعدادات',
      label_en: 'Settings',
    });
  }

  items.push({
    id: 'profile',
    to: '/dashboard/profile',
    label_ar: 'الملف الشخصي',
    label_en: 'Profile',
  });

  return items;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  stats: BarChart3,
  bookings: CalendarCheck,
  clients: Building2,
  projects: FolderKanban,
  billing: Receipt,
  messages: MessageSquare,
  team: Users,
  settings: SettingsIcon,
  profile: UserCircle,
  'client-portal': Briefcase,
};

const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { language, dir } = useLanguage();
  const { user, logout, forbiddenError } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = getAuthorizedNavItems(user);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className="min-h-screen bg-slate-950 pt-28 pb-20 px-4" dir={dir}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-white">
              {user?.role === 'client'
                ? language === 'ar'
                  ? 'بوابة العميل'
                  : 'Client Portal'
                : language === 'ar'
                ? 'لوحة تحكم الإدارة'
                : 'Admin Dashboard'}
            </h1>
            {user && (
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                <span>{user.name}</span>
                <span>•</span>
                <span className="px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-400 font-mono">
                  {user.role}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-200 hover:text-rose-300 text-xs font-bold transition-colors cursor-pointer w-fit"
          >
            <LogOut className="w-4 h-4" />
            <span>{language === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}</span>
          </button>
        </div>

        {forbiddenError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{forbiddenError}</span>
          </div>
        )}

        <nav
          aria-label="Dashboard Navigation"
          className="flex flex-wrap gap-2 p-1.5 bg-slate-900/80 border border-slate-800 rounded-2xl w-fit"
        >
          {navItems.map((item) => {
            const Icon = iconMap[item.id] || BarChart3;
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.id}
                to={item.to}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  active ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{language === 'ar' ? item.label_ar : item.label_en}</span>
              </Link>
            );
          })}
        </nav>

        <div>{children}</div>
      </div>
    </main>
  );
};

export default DashboardLayout;
