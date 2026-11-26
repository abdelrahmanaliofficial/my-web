import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  UserPlus,
  Shield,
  Ban,
  CheckCircle2,
  LogOut,
  AlertCircle,
  Activity,
  Mail,
  LockKeyhole,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient, extractApiError } from '../../lib/apiClient';
import { ActivityLogEntry, TeamMemberRecord, sanitizeUserPayload } from '../../types/auth';

interface PermissionCatalogItem {
  slug: string;
  module: string;
  action: string;
  label: string;
}

const MODULE_LABELS_AR: Record<string, string> = {
  stats: 'الإحصائيات',
  leads: 'العملاء المحتملون',
  services: 'الخدمات',
  projects: 'المشروعات',
  clients: 'العملاء',
  billing: 'الفواتير',
  messages: 'الرسائل',
  settings: 'إعدادات الموقع',
  bookings: 'الحجوزات',
  portfolio: 'معرض الأعمال',
  testimonials: 'آراء العملاء',
  faqs: 'الأسئلة الشائعة',
  blog: 'المقالات',
  partners: 'الشركاء',
  team: 'إدارة الفريق',
};

const TeamSettingsTab: React.FC = () => {
  const { language, dir } = useLanguage();
  const { user, hasPermission } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const canViewTeam = isSuperAdmin || hasPermission('view_team');
  const canInviteTeam = isSuperAdmin || hasPermission('create_team');
  const canManagePermissions = isSuperAdmin || hasPermission('manage_team');
  const canUpdateTeam = isSuperAdmin || hasPermission('update_team') || hasPermission('manage_team');

  const [members, setMembers] = useState<TeamMemberRecord[]>([]);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermissions, setInvitePermissions] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);

  const grantablePermissionSet = useMemo(
    () => new Set(permissionCatalog.map((permission) => permission.slug)),
    [permissionCatalog]
  );

  const groupedPermissions: Record<string, PermissionCatalogItem[]> = useMemo(() => {
    return permissionCatalog.reduce<Record<string, PermissionCatalogItem[]>>((groups, item) => {
      if (!groups[item.module]) groups[item.module] = [];
      groups[item.module].push(item);
      return groups;
    }, {});
  }, [permissionCatalog]);

  const fetchTeamData = useCallback(async () => {
    setLoading(true);
    setServerError(null);
    setCatalogError(null);

    // A delegated administrator may have create_team without view_team. In
    // that case the invite form is available, but private team listings are not fetched.
    if (!canViewTeam) {
      setMembers([]);
      setLogs([]);
      setPermissionCatalog([]);
      setLoading(false);
      return;
    }

    const [teamResult, catalogResult, activityResult] = await Promise.allSettled([
      apiClient.get('/api/team'),
      apiClient.get('/api/team/permission-catalog'),
      apiClient.get('/api/team/activity'),
    ]);

    if (teamResult.status === 'fulfilled') {
      const rawMembers = Array.isArray(teamResult.value.data?.data)
        ? teamResult.value.data.data
        : [];
      const sanitizedMembers = rawMembers
        .map((member: unknown) => sanitizeUserPayload(member))
        .filter((member: TeamMemberRecord | null): member is TeamMemberRecord => member !== null);
      setMembers(sanitizedMembers);
    } else {
      const info = extractApiError(teamResult.reason, 'Failed to load team members.');
      setServerError(info.message);
      setMembers([]);
    }

    if (catalogResult.status === 'fulfilled') {
      const catalog = catalogResult.value.data?.data;
      setPermissionCatalog(
        Array.isArray(catalog)
          ? catalog.filter(
              (item: unknown): item is PermissionCatalogItem =>
                Boolean(item) &&
                typeof item === 'object' &&
                typeof (item as PermissionCatalogItem).slug === 'string' &&
                typeof (item as PermissionCatalogItem).module === 'string' &&
                typeof (item as PermissionCatalogItem).action === 'string' &&
                typeof (item as PermissionCatalogItem).label === 'string'
            )
          : []
      );
    } else {
      const info = extractApiError(catalogResult.reason, 'Failed to load permission catalog.');
      setCatalogError(info.message);
      setPermissionCatalog([]);
    }

    if (activityResult.status === 'fulfilled') {
      const activity = activityResult.value.data?.data;
      setLogs(Array.isArray(activity) ? activity : []);
    } else {
      // Activity history is supplementary; retain usable team data if this
      // endpoint is unavailable, but show its real error.
      const info = extractApiError(activityResult.reason, 'Failed to load team activity.');
      setServerError((current) => current ? `${current} ${info.message}` : info.message);
      setLogs([]);
    }

    setLoading(false);
  }, [canViewTeam]);

  useEffect(() => {
    void fetchTeamData();
  }, [fetchTeamData]);

  const toggleInvitePermission = (permission: string) => {
    if (!canManagePermissions || !grantablePermissionSet.has(permission)) return;
    setInvitePermissions((previous) =>
      previous.includes(permission)
        ? previous.filter((item) => item !== permission)
        : [...previous, permission]
    );
  };

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canInviteTeam) return;

    if (canManagePermissions && (loading || catalogError)) {
      toast.error(language === 'ar' ? 'تعذر تحميل قائمة الصلاحيات. حدّث الصفحة وحاول مجددًا.' : 'The permission catalog is not ready. Reload and try again.');
      return;
    }

    setInviting(true);
    setServerError(null);
    try {
      const response = await apiClient.post('/api/team/invite', {
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: 'custom_admin',
        // Delegated creators may only submit permissions surfaced by the
        // authenticated permission catalog. Create-only users submit none.
        permissions: canManagePermissions
          ? invitePermissions.filter((permission) => grantablePermissionSet.has(permission))
          : [],
      });

      const invitationSent = response.data?.data?.invitation_sent === true;
      if (invitationSent) {
        toast.success(language === 'ar' ? 'تم إنشاء العضو وإرسال الدعوة' : 'Member created and invitation sent');
      } else {
        toast(
          language === 'ar'
            ? 'تم إنشاء الحساب، لكن لم يتم إرسال البريد. راجع إعدادات البريد وأعد إرسال الدعوة.'
            : 'The account was created, but the invitation email was not delivered. Configure mail and resend the invitation.'
        );
      }

      setInviteName('');
      setInviteEmail('');
      setInvitePermissions([]);
      if (canViewTeam) await fetchTeamData();
    } catch (error) {
      const info = extractApiError(error, 'Failed to invite team member.');
      setServerError(info.message);
      toast.error(info.message);
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvitation = async (member: TeamMemberRecord) => {
    if (!canUpdateTeam || member.role !== 'custom_admin' || member.is_active || member.suspended_at) return;
    try {
      const response = await apiClient.post(`/api/team/${member.id}/resend-invitation`);
      if (response.data?.data?.invitation_sent === true) {
        toast.success(language === 'ar' ? 'تم إرسال رابط إعداد كلمة المرور' : 'Password setup link sent');
      } else {
        toast(language === 'ar' ? 'لم يتم تأكيد إرسال البريد. راجع إعدادات البريد.' : 'Email delivery was not confirmed. Check mail configuration.');
      }
    } catch (error) {
      const info = extractApiError(error, 'Failed to resend the invitation.');
      setServerError(info.message);
      toast.error(info.message);
    }
  };

  const handleTogglePermission = async (member: TeamMemberRecord, permission: string) => {
    if (!canManagePermissions || member.role !== 'custom_admin' || !grantablePermissionSet.has(permission)) return;

    // Do not submit a replacement permission set that would silently remove
    // grants outside a delegated administrator's own grantable scope.
    const canEditWholeSet = member.permissions.every((item) => grantablePermissionSet.has(item));
    if (!canEditWholeSet) {
      toast.error(
        language === 'ar'
          ? 'لا يمكنك تعديل هذه المجموعة لأن بها صلاحيات خارج نطاق تفويضك.'
          : 'This member has permissions outside your delegation scope. A Super Admin must update this account.'
      );
      return;
    }

    const nextPermissions = member.permissions.includes(permission)
      ? member.permissions.filter((item) => item !== permission)
      : [...member.permissions, permission];

    try {
      const response = await apiClient.put(`/api/team/${member.id}/permissions`, {
        permissions: nextPermissions,
      });
      const updated = sanitizeUserPayload(response.data?.data);
      if (!updated) throw new Error('The server returned an invalid team member record.');
      setMembers((previous) =>
        previous.map((item) => (item.id === member.id ? updated : item))
      );
      toast.success(language === 'ar' ? 'تم تحديث الصلاحيات' : 'Permissions updated');
    } catch (error) {
      const info = extractApiError(error, 'Failed to update permissions.');
      setServerError(info.message);
      toast.error(info.message);
    }
  };

  const handleToggleStatus = async (member: TeamMemberRecord) => {
    if (!canUpdateTeam || member.role !== 'custom_admin') return;
    const nextActive = !member.is_active;
    try {
      const response = await apiClient.put(`/api/team/${member.id}/status`, { is_active: nextActive });
      const updated = sanitizeUserPayload(response.data?.data);
      if (!updated) throw new Error('The server returned an invalid team member record.');
      setMembers((previous) => previous.map((item) => (item.id === member.id ? updated : item)));
      toast.success(
        nextActive
          ? language === 'ar' ? 'تم تفعيل العضو' : 'Member reactivated'
          : language === 'ar' ? 'تم إيقاف العضو' : 'Member suspended'
      );
    } catch (error) {
      const info = extractApiError(error, 'Failed to update member status.');
      setServerError(info.message);
      toast.error(info.message);
    }
  };

  const handleRevokeSessions = async (member: TeamMemberRecord) => {
    if (!canUpdateTeam || member.role !== 'custom_admin') return;
    try {
      await apiClient.post(`/api/team/${member.id}/revoke-sessions`);
      toast.success(language === 'ar' ? 'تم إنهاء جميع الجلسات النشطة' : 'Active sessions revoked');
    } catch (error) {
      const info = extractApiError(error, 'Failed to revoke sessions.');
      setServerError(info.message);
      toast.error(info.message);
    }
  };

  const actionLabel = (action: string) => {
    if (language !== 'ar') return action;
    const labels: Record<string, string> = {
      view: 'عرض',
      create: 'إضافة',
      update: 'تعديل',
      delete: 'حذف',
      manage: 'إدارة كاملة',
    };
    return labels[action] || action;
  };

  return (
    <div className="space-y-6" dir={dir}>
      {serverError && (
        <div role="alert" className="flex items-start gap-2.5 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      {canInviteTeam && (
        <form onSubmit={handleInvite} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <UserPlus className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-bold text-white">
              {language === 'ar' ? 'دعوة عضو فريق (مشرف مخصص)' : 'Invite Custom Admin'}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              required
              maxLength={255}
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
              placeholder={language === 'ar' ? 'الاسم الكامل' : 'Full Name'}
              className="rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
            />
            <input
              type="email"
              required
              maxLength={255}
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="member@company.com"
              className="rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
            />
          </div>

          {canManagePermissions ? (
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="block text-xs font-bold text-slate-400">
                  {language === 'ar' ? 'تعيين الصلاحيات المتاحة لك' : 'Assign permissions available to you'}
                </span>
                <span className="text-[11px] text-slate-500">{invitePermissions.length} / {permissionCatalog.length}</span>
              </div>
              {catalogError ? (
                <p role="alert" className="text-xs text-rose-300">{catalogError}</p>
              ) : permissionCatalog.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {language === 'ar' ? 'جارٍ تحميل كتالوج الصلاحيات أو لا توجد صلاحيات قابلة للتفويض.' : 'Loading permissions or no grantable permissions are available.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(groupedPermissions).map(([module, permissions]) => (
                    <div key={module} className="rounded-xl border border-slate-800 p-3">
                      <h4 className="text-xs font-bold text-slate-300 mb-2">
                        {language === 'ar' ? MODULE_LABELS_AR[module] || module : module}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {permissions.map((permission) => {
                          const selected = invitePermissions.includes(permission.slug);
                          return (
                            <button
                              key={permission.slug}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggleInvitePermission(permission.slug)}
                              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${selected ? 'bg-sky-500/20 border-sky-500 text-sky-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'}`}
                            >
                              {actionLabel(permission.action)}
                              <span className="ms-1.5 font-mono">{permission.slug}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? 'يمكنك إنشاء الحساب، لكن لا يمكنك منح صلاحيات له. سيُنشأ دون صلاحيات حتى يراجعها مسؤول مخوّل.'
                : 'You may create the account, but you cannot grant permissions. It will be created without permissions for an authorized manager to review.'}
            </p>
          )}

          <button type="submit" disabled={inviting || (canManagePermissions && (loading || Boolean(catalogError)))} className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-sm cursor-pointer">
            {inviting
              ? language === 'ar' ? 'جارٍ الإرسال...' : 'Sending Invite...'
              : language === 'ar' ? 'إرسال الدعوة' : 'Invite Member'}
          </button>
        </form>
      )}

      {canViewTeam ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-sky-400" />
            <h3 className="text-lg font-bold text-white">
              {language === 'ar' ? 'أعضاء الفريق والصلاحيات' : 'Team Members & Permission Matrix'}
            </h3>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400">{language === 'ar' ? 'جارٍ تحميل الفريق...' : 'Loading team members...'}</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-slate-500">{language === 'ar' ? 'لا توجد بيانات فريق متاحة من الخادم.' : 'No team member records returned from backend.'}</p>
          ) : (
            <div className="space-y-4">
              {members.map((member) => {
                const isProtectedAccount = member.role === 'super_admin' || member.id === user?.id;
                const canEditMemberPermissions = canManagePermissions &&
                  member.role === 'custom_admin' &&
                  member.permissions.every((permission) => grantablePermissionSet.has(permission));

                return (
                  <div key={member.id} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white">{member.name}</span>
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 text-[11px] font-mono">{member.role}</span>
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${member.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {member.is_active ? 'active' : 'inactive'}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">{member.email}</span>
                        {member.last_login_at && (
                          <span className="block text-[11px] text-slate-500 mt-1">
                            {language === 'ar' ? 'آخر دخول: ' : 'Last login: '}{new Date(member.last_login_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                          </span>
                        )}
                      </div>

                      {!isProtectedAccount && canUpdateTeam && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {!member.is_active && !member.suspended_at && (
                            <button type="button" onClick={() => handleResendInvitation(member)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 text-xs font-semibold cursor-pointer">
                              <Mail className="w-3.5 h-3.5" />
                              <span>{language === 'ar' ? 'إعادة إرسال الدعوة' : 'Resend Invitation'}</span>
                            </button>
                          )}
                          <button type="button" onClick={() => handleRevokeSessions(member)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold cursor-pointer">
                            <LogOut className="w-3.5 h-3.5" />
                            <span>{language === 'ar' ? 'إنهاء الجلسات' : 'Revoke Sessions'}</span>
                          </button>
                          <button type="button" onClick={() => handleToggleStatus(member)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${member.is_active ? 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20' : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'}`}>
                            {member.is_active ? <><Ban className="w-3.5 h-3.5" /><span>{language === 'ar' ? 'إيقاف' : 'Suspend'}</span></> : <><CheckCircle2 className="w-3.5 h-3.5" /><span>{language === 'ar' ? 'تفعيل' : 'Reactivate'}</span></>}
                          </button>
                        </div>
                      )}
                    </div>

                    {member.role === 'custom_admin' && (
                      <div className="pt-3 border-t border-slate-800/70 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                          <LockKeyhole className="w-3.5 h-3.5" />
                          {language === 'ar' ? 'الصلاحيات الممنوحة' : 'Assigned permissions'}
                        </div>
                        {canEditMemberPermissions ? (
                          <div className="space-y-3">
                            {Object.entries(groupedPermissions).map(([module, permissions]) => (
                              <div key={`${member.id}-${module}`}>
                                <h5 className="text-[11px] font-bold text-slate-500 mb-1.5">
                                  {language === 'ar' ? MODULE_LABELS_AR[module] || module : module}
                                </h5>
                                <div className="flex flex-wrap gap-1.5">
                                  {permissions.map((permission) => {
                                    const selected = member.permissions.includes(permission.slug);
                                    return (
                                      <button
                                        key={permission.slug}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => handleTogglePermission(member, permission.slug)}
                                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono border transition-colors cursor-pointer ${selected ? 'bg-sky-500/20 border-sky-500/50 text-sky-300' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white'}`}
                                      >
                                        {permission.slug}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                            {member.permissions.length === 0 && (
                              <p className="text-xs text-slate-500">{language === 'ar' ? 'لا توجد صلاحيات معينة.' : 'No permissions assigned.'}</p>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {member.permissions.length === 0 ? (
                              <span className="text-xs text-slate-500">{language === 'ar' ? 'لا توجد صلاحيات معينة.' : 'No permissions assigned.'}</span>
                            ) : member.permissions.map((permission) => (
                              <span key={permission} className="px-2.5 py-1 rounded-md text-[11px] font-mono border bg-slate-900 border-slate-800 text-slate-400">
                                {permission}
                              </span>
                            ))}
                          </div>
                        )}
                        {canManagePermissions && !canEditMemberPermissions && member.permissions.some((permission) => !grantablePermissionSet.has(permission)) && (
                          <p className="text-[11px] text-amber-300">
                            {language === 'ar' ? 'لا يمكن تعديل هذه المجموعة بالكامل بصلاحياتك الحالية. يلزم تدخل Super Admin.' : 'This permission set is outside your delegation scope. A Super Admin must change it.'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-sm text-slate-400">
          {language === 'ar'
            ? 'ليس لديك صلاحية عرض قائمة الفريق. يمكنك فقط تنفيذ الإجراءات التي تسمح بها صلاحيات حسابك.'
            : 'You do not have permission to view the team list. You can only perform actions explicitly assigned to your account.'}
        </div>
      )}

      {canViewTeam && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-white">{language === 'ar' ? 'سجل النشاط الإداري' : 'Administrative Activity Log'}</h3>
          </div>
          {logs.length > 0 ? (
            <ul className="space-y-2 text-xs text-slate-300">
              {logs.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span><strong className="text-white">{entry.actor_name}</strong> — {entry.action}{entry.target ? ` (${entry.target})` : ''}</span>
                  <span className="text-slate-500 whitespace-nowrap">{entry.created_at}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">{language === 'ar' ? 'لا توجد أنشطة مسجلة.' : 'No activity records available.'}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default TeamSettingsTab;
