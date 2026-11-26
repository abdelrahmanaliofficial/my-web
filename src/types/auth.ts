export type UserRole = 'super_admin' | 'custom_admin' | 'client';

export type PermissionAction = 'view' | 'create' | 'update' | 'delete' | 'manage';

export type ModulePermission =
  | 'view_stats'
  | 'create_stats'
  | 'update_stats'
  | 'delete_stats'
  | 'manage_stats'
  | 'view_leads'
  | 'create_leads'
  | 'update_leads'
  | 'delete_leads'
  | 'manage_leads'
  | 'view_services'
  | 'create_services'
  | 'update_services'
  | 'delete_services'
  | 'manage_services'
  | 'view_projects'
  | 'create_projects'
  | 'update_projects'
  | 'delete_projects'
  | 'manage_projects'
  | 'view_clients'
  | 'create_clients'
  | 'update_clients'
  | 'delete_clients'
  | 'manage_clients'
  | 'view_billing'
  | 'create_billing'
  | 'update_billing'
  | 'delete_billing'
  | 'manage_billing'
  | 'view_messages'
  | 'create_messages'
  | 'update_messages'
  | 'delete_messages'
  | 'manage_messages'
  | 'view_settings'
  | 'create_settings'
  | 'update_settings'
  | 'delete_settings'
  | 'manage_settings'
  | 'view_bookings'
  | 'create_bookings'
  | 'update_bookings'
  | 'delete_bookings'
  | 'manage_bookings'
  | 'view_portfolio'
  | 'create_portfolio'
  | 'update_portfolio'
  | 'delete_portfolio'
  | 'manage_portfolio'
  | 'view_testimonials'
  | 'create_testimonials'
  | 'update_testimonials'
  | 'delete_testimonials'
  | 'manage_testimonials'
  | 'view_faqs'
  | 'create_faqs'
  | 'update_faqs'
  | 'delete_faqs'
  | 'manage_faqs'
  | 'view_blog'
  | 'create_blog'
  | 'update_blog'
  | 'delete_blog'
  | 'manage_blog'
  | 'view_partners'
  | 'create_partners'
  | 'update_partners'
  | 'delete_partners'
  | 'manage_partners'
  | 'view_team'
  | 'create_team'
  | 'update_team'
  | 'delete_team'
  | 'manage_team'

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  permissions: string[];
  is_active: boolean;
  email_verified_at: string | null;
  suspended_at: string | null;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
  remember?: boolean;
}

export interface TeamMemberRecord extends User {
  last_login_at?: string | null;
}

export interface ActivityLogEntry {
  id: number;
  actor_name: string;
  action: string;
  target?: string;
  created_at: string;
}

export function normalizeRole(rawRole: unknown): UserRole | null {
  if (typeof rawRole !== 'string') return null;
  const normalized = rawRole.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'super_admin' || normalized === 'custom_admin' || normalized === 'client') {
    return normalized;
  }
  return null;
}

/**
 * Sanitizes backend user payload to ensure password fields are never retained client-side.
 */
export function sanitizeUserPayload(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const role = normalizeRole(record.role);
  if (!role || typeof record.id !== 'number' || typeof record.email !== 'string') {
    return null;
  }

  return {
    id: record.id,
    name: typeof record.name === 'string' ? record.name : record.email,
    email: record.email,
    role,
    permissions: Array.isArray(record.permissions)
      ? record.permissions.filter((p): p is string => typeof p === 'string')
      : [],
    // Missing activity state must never silently grant access.
    is_active: record.is_active === true,
    email_verified_at: typeof record.email_verified_at === 'string' ? record.email_verified_at : null,
    suspended_at: typeof record.suspended_at === 'string' ? record.suspended_at : null,
    created_at: typeof record.created_at === 'string' ? record.created_at : undefined,
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : undefined,
    last_login_at: typeof record.last_login_at === 'string' ? record.last_login_at : null,
  };
}
