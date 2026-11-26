import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  UserPlus,
  Search,
  Building2,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  Send,
  RefreshCw,
  Ban,
  CheckCircle2,
  ShieldOff,
  FolderKanban,
  Activity,
  Briefcase,
  AlertCircle,
  X,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient, extractApiError } from '../../lib/apiClient';
import {
  ClientAccountStatus,
  ClientRecord,
  ContractedService,
  filterClients,
} from '../../types/client';

const statusStyles: Record<ClientAccountStatus, string> = {
  invited: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  active: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  suspended: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

const ClientsPage: React.FC = () => {
  const { language, dir } = useLanguage();
  const { hasPermission } = useAuth();

  const canCreateClients = hasPermission('create_clients') || hasPermission('manage_clients');
  const canUpdateClients = hasPermission('update_clients') || hasPermission('manage_clients');
  const canManageClients = hasPermission('manage_clients');
  const canViewProjects = hasPermission('view_projects') || hasPermission('manage_projects');

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [services, setServices] = useState<ContractedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientAccountStatus>('all');
  const [serviceFilter, setServiceFilter] = useState<number | 'all'>('all');

  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'projects' | 'activity'>('overview');
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createFullName, setCreateFullName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createCompany, setCreateCompany] = useState('');
  const [createAddress, setCreateAddress] = useState('');
  const [createServiceIds, setCreateServiceIds] = useState<number[]>([]);
  const [sendInvitationOnCreate, setSendInvitationOnCreate] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit form state for selected client
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editServiceIds, setEditServiceIds] = useState<number[]>([]);

  const hydrateEditFields = (client: ClientRecord) => {
    setEditFullName(client.full_name || '');
    setEditEmail(client.email || '');
    setEditPhone(client.phone || '');
    setEditCompany(client.company_name || '');
    setEditAddress(client.address || '');
    setEditServiceIds((client.services || []).map((s) => s.id));
  };

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setServerError(null);
    try {
      const params: Record<string, string | number> = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'all') params.status = statusFilter;
      if (serviceFilter !== 'all') params.service_id = serviceFilter;
      params.page = pagination.current_page;
      params.per_page = pagination.per_page;

      const [clientsResult, servicesResult] = await Promise.allSettled([
        apiClient.get('/api/clients', { params }),
        apiClient.get('/api/services'),
      ]);

      if (clientsResult.status === 'rejected') {
        throw clientsResult.reason;
      }

      const clientsRes = clientsResult.value;
      if (Array.isArray(clientsRes.data?.data)) {
        setClients(clientsRes.data.data);
        const meta = clientsRes.data?.meta;
        if (meta && Number.isFinite(Number(meta.current_page)) && Number.isFinite(Number(meta.last_page))) {
          setPagination({
            current_page: Number(meta.current_page),
            last_page: Number(meta.last_page),
            per_page: Number(meta.per_page) || 15,
            total: Number(meta.total) || 0,
          });
        }
      } else {
        throw new Error('The server returned an invalid client directory response.');
      }

      if (servicesResult.status === 'fulfilled' && Array.isArray(servicesResult.value.data?.data)) {
        setServices(servicesResult.value.data.data);
        setServicesError(null);
      } else {
        setServices([]);
        const serviceFailure = servicesResult.status === 'rejected'
          ? extractApiError(servicesResult.reason, 'Unable to load service catalogue.')
          : { message: 'The service catalogue response was invalid.' };
        setServicesError(serviceFailure.message);
      }
    } catch (err) {
      const info = extractApiError(err, 'Failed to load client accounts from server.');
      setServerError(info.message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, serviceFilter, pagination.current_page, pagination.per_page]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const loadClientDetail = async (id: number) => {
    setLoadingDetail(true);
    try {
      const res = await apiClient.get(`/api/clients/${id}`);
      const detail: ClientRecord | undefined = res.data?.data;
      if (detail) {
        setSelectedClient(detail);
        hydrateEditFields(detail);
        setClients((prev) => prev.map((c) => (c.id === detail.id ? { ...c, ...detail } : c)));
      }
    } catch (err) {
      const info = extractApiError(err, 'Unable to load client details.');
      toast.error(info.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSelectClient = (client: ClientRecord) => {
    setSelectedClient(client);
    setDetailTab('overview');
    hydrateEditFields(client);
    loadClientDetail(client.id);
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateClients) return;
    setActionBusy(true);
    setCreateError(null);
    try {
      await apiClient.get('/sanctum/csrf-cookie');
      const shouldSendInvitation = canManageClients && sendInvitationOnCreate;
      const res = await apiClient.post('/api/clients', {
        full_name: createFullName.trim(),
        email: createEmail.trim(),
        phone: createPhone.trim() || null,
        company_name: createCompany.trim() || null,
        address: createAddress.trim() || null,
        service_ids: createServiceIds,
        send_invitation: shouldSendInvitation,
      });

      const created: ClientRecord | undefined = res.data?.data;
      if (shouldSendInvitation && res.data?.invitation?.delivery_status !== 'accepted' && res.data?.invitation?.delivery_status !== 'test_sink') {
        toast.error(res.data?.message || (language === 'ar'
          ? 'تم إنشاء العميل لكن لم يتم إرسال الدعوة. راجع إعدادات البريد.'
          : 'Client created, but the invitation email was not sent. Check mail configuration.'));
      } else {
        toast.success(res.data?.message || (language === 'ar' ? 'تم إنشاء ملف العميل بنجاح' : 'Client account created'));
      }
      setCreateOpen(false);
      setCreateFullName('');
      setCreateEmail('');
      setCreatePhone('');
      setCreateCompany('');
      setCreateAddress('');
      setCreateServiceIds([]);
      await fetchClients();
      if (created) {
        handleSelectClient(created);
      }
    } catch (err) {
      const info = extractApiError(err, 'Failed to create client account.');
      setCreateError(info.message);
      toast.error(info.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !canUpdateClients) return;
    setActionBusy(true);
    try {
      await apiClient.get('/sanctum/csrf-cookie');
      const res = await apiClient.put(`/api/clients/${selectedClient.id}`, {
        full_name: editFullName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim() || null,
        company_name: editCompany.trim() || null,
        address: editAddress.trim() || null,
        service_ids: editServiceIds,
      });
      const updated: ClientRecord | undefined = res.data?.data;
      if (updated) {
        setSelectedClient(updated);
        hydrateEditFields(updated);
        setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      }
      if (res.data?.requires_reinvitation) {
        toast.error(language === 'ar'
          ? 'تم تحديث البريد وإلغاء الدعوات والجلسات السابقة. أرسل دعوة جديدة إلى البريد الجديد.'
          : 'Email updated. Previous invitations and sessions were revoked; send a new invitation to the new address.');
      } else {
        toast.success(language === 'ar' ? 'تم تحديث بيانات العميل' : 'Client information updated');
      }
    } catch (err) {
      const info = extractApiError(err, 'Failed to update client.');
      toast.error(info.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleLifecycleAction = async (
    action: 'activate' | 'suspend' | 'invite' | 'resend' | 'revoke'
  ) => {
    if (!selectedClient || !canManageClients) return;
    setActionBusy(true);
    try {
      await apiClient.get('/sanctum/csrf-cookie');
      let res;
      if (action === 'activate' || action === 'suspend') {
        res = await apiClient.put(`/api/clients/${selectedClient.id}/status`, {
          account_status: action === 'activate' ? 'active' : 'suspended',
        });
      } else if (action === 'invite') {
        res = await apiClient.post(`/api/clients/${selectedClient.id}/invite`);
      } else if (action === 'resend') {
        res = await apiClient.post(`/api/clients/${selectedClient.id}/resend-invitation`);
      } else {
        res = await apiClient.post(`/api/clients/${selectedClient.id}/revoke-access`);
      }

      const updated: ClientRecord | undefined = res.data?.data;
      if (updated) {
        setSelectedClient(updated);
        setClients((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      }
      await loadClientDetail(selectedClient.id);
      const deliveryStatus = res.data?.invitation?.delivery_status;
      if (deliveryStatus && !['accepted', 'test_sink'].includes(deliveryStatus)) {
        toast.error(res.data?.message || 'The invitation was generated but not delivered.');
      } else {
        toast.success(res.data?.message || 'Action completed');
      }
    } catch (err) {
      const info = extractApiError(err, 'Unable to execute account lifecycle action.');
      toast.error(info.message);
    } finally {
      setActionBusy(false);
    }
  };



  const visibleClients = filterClients(clients, {
    search,
    status: statusFilter,
    serviceId: serviceFilter,
  });

  return (
    <div className="space-y-6" dir={dir}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">
            {language === 'ar' ? 'إدارة حسابات العملاء' : 'Client Account Management'}
          </h2>
          <p className="text-xs text-slate-400">
            {language === 'ar'
              ? 'إنشاء الحسابات، إرسال الدعوات الآمنة، تعيين الخدمات، ومتابعة المشاريع والنشاط'
              : 'Manage client profiles, secure invitations, contracted services, projects, and account status.'}
          </p>
        </div>

        {canCreateClients && (
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setSendInvitationOnCreate(canManageClients);
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-colors cursor-pointer w-fit"
          >
            <UserPlus className="w-4 h-4" />
            <span>{language === 'ar' ? 'إضافة عميل جديد' : 'New Client'}</span>
          </button>
        )}
      </div>

      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}
      {servicesError && (
        <div role="status" className="text-xs text-amber-300">
          {language === 'ar' ? 'تعذر تحميل قائمة الخدمات: ' : 'Service catalogue could not be loaded: '}{servicesError}
        </div>
      )}

      {/* Search & Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPagination((prev) => ({ ...prev, current_page: 1 })); }}
            placeholder={
              language === 'ar'
                ? 'بحث بالاسم، البريد، الشركة، أو رقم العميل...'
                : 'Search name, email, company, or Client ID...'
            }
            className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-10 pe-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
          />
        </div>

        <select
          aria-label="Filter by account status"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as 'all' | ClientAccountStatus); setPagination((prev) => ({ ...prev, current_page: 1 })); }}
          className="rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
        >
          <option value="all">{language === 'ar' ? 'جميع الحالات' : 'All Statuses'}</option>
          <option value="invited">{language === 'ar' ? 'بانتظار التفعيل' : 'Invited'}</option>
          <option value="active">{language === 'ar' ? 'نشط' : 'Active'}</option>
          <option value="suspended">{language === 'ar' ? 'موقوف' : 'Suspended'}</option>
        </select>

        <select
          aria-label="Filter by contracted service"
          value={serviceFilter}
          onChange={(e) => {
            setServiceFilter(e.target.value === 'all' ? 'all' : Number(e.target.value));
            setPagination((prev) => ({ ...prev, current_page: 1 }));
          }}
          className="rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
        >
          <option value="all">{language === 'ar' ? 'جميع الخدمات' : 'All Services'}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Main Grid: Client List + Details Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-6 text-sm text-slate-400">
              {language === 'ar' ? 'جارٍ تحميل العملاء...' : 'Loading client directory...'}
            </div>
          ) : visibleClients.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {language === 'ar'
                ? 'لا توجد حسابات عملاء مطابقة.'
                : 'No client accounts found.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {visibleClients.map((client) => {
                const isSelected = selectedClient?.id === client.id;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => handleSelectClient(client)}
                    className={`w-full text-start p-4 transition-colors cursor-pointer ${
                      isSelected ? 'bg-sky-500/10' : 'hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{client.full_name}</span>
                          <span className="text-[11px] font-mono text-sky-400">
                            {client.client_code}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{client.email}</p>
                        {client.company_name && (
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            <span>{client.company_name}</span>
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                          statusStyles[client.account_status]
                        }`}
                      >
                        {client.account_status}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-800 text-xs text-slate-400">
            <span>
              {language === 'ar'
                ? `صفحة ${pagination.current_page} من ${pagination.last_page} • ${pagination.total} عميل`
                : `Page ${pagination.current_page} of ${pagination.last_page} • ${pagination.total} clients`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={loading || pagination.current_page <= 1}
                onClick={() => setPagination((prev) => ({ ...prev, current_page: Math.max(1, prev.current_page - 1) }))}
                className="px-3 py-1.5 rounded-lg border border-slate-700 disabled:opacity-40"
              >
                {language === 'ar' ? 'السابق' : 'Previous'}
              </button>
              <button
                type="button"
                disabled={loading || pagination.current_page >= pagination.last_page}
                onClick={() => setPagination((prev) => ({ ...prev, current_page: Math.min(prev.last_page, prev.current_page + 1) }))}
                className="px-3 py-1.5 rounded-lg border border-slate-700 disabled:opacity-40"
              >
                {language === 'ar' ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          {!selectedClient ? (
            <div className="h-full min-h-[260px] flex items-center justify-center text-sm text-slate-500">
              {language === 'ar'
                ? 'اختر عميلاً لعرض التفاصيل وإدارة الحساب'
                : 'Select a client from the list to inspect details and manage lifecycle actions.'}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-lg font-bold text-white">{selectedClient.full_name}</h3>
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 font-mono text-xs">
                      {selectedClient.client_code}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                        statusStyles[selectedClient.account_status]
                      }`}
                    >
                      {selectedClient.account_status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {language === 'ar' ? 'تم الإنشاء:' : 'Created:'}{' '}
                    {new Date(selectedClient.created_at).toLocaleString()} •{' '}
                    {language === 'ar' ? 'آخر تحديث:' : 'Updated:'}{' '}
                    {new Date(selectedClient.updated_at).toLocaleString()}
                  </p>
                  <p className="text-xs mt-2 text-slate-400">
                    {language === 'ar'
                      ? selectedClient.account_setup_completed ? 'تم إعداد كلمة المرور وتأكيد البريد.' : 'لم يكمل العميل إعداد كلمة المرور بعد.'
                      : selectedClient.account_setup_completed ? 'Password setup and email verification completed.' : 'Client has not completed password setup yet.'}
                    {selectedClient.latest_invitation?.delivery_status && (
                      <span className="ms-2 text-sky-300">• {selectedClient.latest_invitation.delivery_status}</span>
                    )}
                  </p>
                </div>

              </div>

              {/* Lifecycle Actions Bar */}
              {canManageClients && (
                <div className="flex flex-wrap gap-2">
                  {!selectedClient.account_setup_completed && (
                    (() => {
                      const invitation = selectedClient.latest_invitation;
                      const invitationPending = Boolean(
                        invitation &&
                        !invitation.accepted_at &&
                        !invitation.revoked_at &&
                        new Date(invitation.expires_at).getTime() > Date.now()
                      );
                      const invitationAction = invitationPending ? 'resend' : 'invite';
                      return (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleLifecycleAction(invitationAction)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20 text-xs font-semibold cursor-pointer"
                        >
                          {invitationPending ? <RefreshCw className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                          <span>{language === 'ar'
                            ? invitationPending ? 'إعادة إرسال الدعوة' : 'إرسال دعوة'
                            : invitationPending ? 'Resend Invitation' : 'Send Invitation'}</span>
                        </button>
                      );
                    })()
                  )}

                  {selectedClient.account_setup_completed && selectedClient.account_status !== 'active' && (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleLifecycleAction('activate')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 text-xs font-semibold cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'إعادة تفعيل الحساب' : 'Reactivate Account'}</span>
                    </button>
                  )}

                  {selectedClient.account_status === 'active' && (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleLifecycleAction('suspend')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'إيقاف الحساب' : 'Suspend Account'}</span>
                    </button>
                  )}

                  {selectedClient.account_status !== 'suspended' && (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleLifecycleAction('revoke')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 text-xs font-semibold cursor-pointer"
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'سحب الصلاحية' : 'Revoke Access'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Detail Sub-tabs */}
              <div className="flex gap-2 border-b border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => setDetailTab('overview')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    detailTab === 'overview'
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {language === 'ar' ? 'الملف والخدمات' : 'Profile & Services'}
                </button>
                {canViewProjects && <button
                  type="button"
                  onClick={() => setDetailTab('projects')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    detailTab === 'projects'
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>
                    {language === 'ar' ? 'المشاريع' : 'Projects'} (
                    {selectedClient.projects?.length || 0})
                  </span>
                </button>}
                <button
                  type="button"
                  onClick={() => setDetailTab('activity')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    detailTab === 'activity'
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'سجل النشاط' : 'Activity Log'}</span>
                </button>
              </div>

              {loadingDetail && (
                <p className="text-xs text-slate-400">
                  {language === 'ar' ? 'جارٍ التحديث...' : 'Refreshing details...'}
                </p>
              )}

              {detailTab === 'overview' && (
                <form onSubmit={handleUpdateClient} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        {language === 'ar' ? 'الاسم الكامل' : 'Full Name'}
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!canUpdateClients}
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        {language === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                      </label>
                      <div className="relative">
                        <Mail className="w-3.5 h-3.5 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3" />
                        <input
                          type="email"
                          required
                          disabled={!canUpdateClients || !canManageClients}
                          title={!canManageClients ? (language === 'ar' ? 'تغيير البريد يتطلب صلاحية إدارة العملاء الكاملة لأنه يلغي جلسات الدخول ويحتاج دعوة جديدة.' : 'Changing the login email requires full client-management permission because it revokes sessions and requires a new invitation.') : undefined}
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-9 pe-3 py-2 text-sm text-white disabled:opacity-60"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        {language === 'ar' ? 'الهاتف' : 'Phone'}
                      </label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3" />
                        <input
                          type="text"
                          disabled={!canUpdateClients}
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-9 pe-3 py-2 text-sm text-white disabled:opacity-60"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        {language === 'ar' ? 'الشركة' : 'Company Name'}
                      </label>
                      <div className="relative">
                        <Building2 className="w-3.5 h-3.5 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3" />
                        <input
                          type="text"
                          disabled={!canUpdateClients}
                          value={editCompany}
                          onChange={(e) => setEditCompany(e.target.value)}
                          className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-9 pe-3 py-2 text-sm text-white disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      {language === 'ar' ? 'العنوان' : 'Address'}
                    </label>
                    <div className="relative">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 absolute top-3 start-3" />
                      <textarea
                        rows={2}
                        disabled={!canUpdateClients}
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-9 pe-3 py-2 text-sm text-white disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400 mb-2">
                      <Briefcase className="w-3.5 h-3.5" />
                      <span>
                        {language === 'ar' ? 'الخدمات المتعاقد عليها' : 'Assigned Contracted Services'}
                      </span>
                    </span>
                    {services.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        {language === 'ar'
                          ? 'لا توجد خدمات مسجلة في الكتالوج حالياً.'
                          : 'No active services returned from catalog.'}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {services.map((service) => {
                          const checked = editServiceIds.includes(service.id);
                          return (
                            <button
                              key={service.id}
                              type="button"
                              disabled={!canUpdateClients}
                              onClick={() =>
                                setEditServiceIds((prev) =>
                                  prev.includes(service.id)
                                    ? prev.filter((sid) => sid !== service.id)
                                    : [...prev, service.id]
                                )
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                checked
                                  ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                                  : 'bg-slate-950 border-slate-800 text-slate-400'
                              } ${canUpdateClients ? 'cursor-pointer' : 'opacity-60'}`}
                            >
                              {service.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {canUpdateClients && (
                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-sm cursor-pointer"
                    >
                      {language === 'ar' ? 'حفظ التعديلات' : 'Save Client Changes'}
                    </button>
                  )}
                </form>
              )}

              {canViewProjects && detailTab === 'projects' && (
                <div className="space-y-3">
                  {!selectedClient.projects || selectedClient.projects.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      {language === 'ar'
                        ? 'لا توجد مشاريع معينة لهذا العميل حالياً.'
                        : 'No assigned projects for this client.'}
                    </p>
                  ) : (
                    selectedClient.projects.map((project) => (
                      <div
                        key={project.id}
                        className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-white text-sm">
                              {project.name || project.title}
                            </p>
                            {project.project_code && (
                              <span className="text-[11px] font-mono text-sky-400">
                                {project.project_code}
                              </span>
                            )}
                          </div>
                          {(project.description || project.summary) && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              {project.description || project.summary}
                            </p>
                          )}
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-300 text-xs font-semibold">
                          {project.status}
                          {typeof project.progress_percentage === 'number'
                            ? ` (${project.progress_percentage}%)`
                            : ''}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'activity' && (
                <div className="space-y-2.5">
                  {!selectedClient.activity_logs || selectedClient.activity_logs.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      {language === 'ar'
                        ? 'لا يوجد سجل نشاط لهذا العميل حتى الآن.'
                        : 'No recorded activity events yet.'}
                    </p>
                  ) : (
                    selectedClient.activity_logs.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start justify-between gap-3 text-xs"
                      >
                        <div>
                          <span className="font-bold text-sky-400 font-mono">{entry.action}</span>
                          <p className="text-slate-300 mt-0.5">{entry.description}</p>
                          {entry.actor && (
                            <span className="text-slate-500">By: {entry.actor.name}</span>
                          )}
                        </div>
                        <span className="text-slate-500 shrink-0">
                          {new Date(entry.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Client Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCreateOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              aria-label="Close modal"
              className="absolute top-4 end-4 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {language === 'ar' ? 'إنشاء ملف وحساب عميل' : 'Create Client Profile & Account'}
                </h3>
                <p className="text-xs text-slate-400">
                  {language === 'ar'
                    ? 'يُنشأ ملف العميل وحسابه داخل قاعدة البيانات. يمكن إرسال دعوة آمنة لإعداد كلمة المرور.'
                    : 'Creates the client profile and linked account in the database. A secure password setup invitation can be sent.'}
                </p>
              </div>
            </div>

            {createError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs"
              >
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateClient} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {language === 'ar' ? 'الاسم الكامل *' : 'Full Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {language === 'ar' ? 'البريد الإلكتروني *' : 'Email Address *'}
                  </label>
                  <input
                    type="email"
                    required
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {language === 'ar' ? 'رقم الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {language === 'ar' ? 'اسم الشركة' : 'Company Name'}
                </label>
                <input
                  type="text"
                  value={createCompany}
                  onChange={(e) => setCreateCompany(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {language === 'ar' ? 'العنوان' : 'Address'}
                </label>
                <input
                  type="text"
                  value={createAddress}
                  onChange={(e) => setCreateAddress(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              {services.length > 0 && (
                <div>
                  <span className="block text-xs font-semibold text-slate-300 mb-2">
                    {language === 'ar' ? 'تعيين الخدمات' : 'Assign Contracted Services'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {services.map((service) => {
                      const active = createServiceIds.includes(service.id);
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() =>
                            setCreateServiceIds((prev) =>
                              prev.includes(service.id)
                                ? prev.filter((id) => id !== service.id)
                                : [...prev, service.id]
                            )
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                            active
                              ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          {service.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {canManageClients ? (
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendInvitationOnCreate}
                    onChange={(e) => setSendInvitationOnCreate(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-sky-500"
                  />
                  <span>
                    {language === 'ar'
                      ? 'إرسال رابط إعداد كلمة المرور وتفعيل الحساب فوراً'
                      : 'Send secure password setup invitation immediately'}
                  </span>
                </label>
              ) : (
                <p className="text-xs text-amber-300">
                  {language === 'ar'
                    ? 'يمكنك إنشاء ملف وحساب العميل. إرسال دعوة الدخول يتطلب صلاحية إدارة العملاء الكاملة.'
                    : 'You can create the client profile and account. Sending an invitation requires full client-management permission.'}
                </p>
              )}

              <button
                type="submit"
                disabled={actionBusy}
                className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-sm cursor-pointer"
              >
                {actionBusy
                  ? language === 'ar'
                    ? 'جارٍ الحفظ...'
                    : 'Creating Client...'
                  : language === 'ar'
                  ? 'إنشاء العميل'
                  : 'Create Client'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientsPage;
