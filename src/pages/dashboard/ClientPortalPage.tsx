import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CalendarCheck,
  AlertCircle,
  Briefcase,
  UserCheck,
  Save,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useProjects } from '../../contexts/ProjectsContext';
import { apiClient, extractApiError } from '../../lib/apiClient';
import { ClientRecord, sanitizeClientSelfUpdatePayload } from '../../types/client';
import ClientOverallProgress from '../../components/client/ClientOverallProgress';
import ClientProjectStatus from '../../components/client/ClientProjectStatus';
import ClientInvoicesSection from '../../components/client/ClientInvoicesSection';
import ClientMessagesSection from '../../components/client/ClientMessagesSection';

interface ClientBooking {
  id: number;
  plan: string;
  businessType: string;
  status: string;
  created_at: string;
}

const ClientPortalPage: React.FC = () => {
  const { language, dir } = useLanguage();
  const { user, refreshUser } = useAuth();
  const {
    projects: clientProjects,
    error: projectsError,
    respondToApproval,
  } = useProjects();
  const [profile, setProfile] = useState<ClientRecord | null>(null);
  const [bookings, setBookings] = useState<ClientBooking[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Permitted self-update personal fields only
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    Promise.all([
      apiClient.get('/api/client/profile').catch((err) => {
        const info = extractApiError(err, 'Unable to load your client profile.');
        setErrorMsg(info.message);
        return null;
      }),
      apiClient.get('/api/client/bookings').catch(() => null),
    ]).then(([profileRes, bookingsRes]) => {
      const profileData: ClientRecord | undefined = profileRes?.data?.data;
      if (profileData) {
        setProfile(profileData);
        setFullName(profileData.full_name || '');
        setPhone(profileData.phone || '');
        setCompanyName(profileData.company_name || '');
        setAddress(profileData.address || '');
      }
      if (Array.isArray(bookingsRes?.data?.data)) {
        setBookings(bookingsRes.data.data);
      }
    });
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      await apiClient.get('/sanctum/csrf-cookie');
      const payload = sanitizeClientSelfUpdatePayload({
        full_name: fullName,
        phone,
        company_name: companyName,
        address,
      });
      const res = await apiClient.put('/api/client/profile', payload);
      if (res.data?.data) {
        setProfile(res.data.data);
      }
      await refreshUser();
      toast.success(language === 'ar' ? 'تم تحديث بياناتك بنجاح' : 'Personal profile updated');
    } catch (err) {
      const info = extractApiError(err, 'Unable to update your profile.');
      setErrorMsg(info.message);
      toast.error(info.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir={dir}>
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">
            {language === 'ar'
              ? `مرحباً، ${profile?.full_name || user?.name || ''}`
              : `Welcome, ${profile?.full_name || user?.name || ''}`}
          </h2>
          <p className="text-xs text-slate-400">
            {language === 'ar'
              ? 'يمكنك تحديث بياناتك الشخصية ومتابعة خدماتك ومشاريعك.'
              : 'Manage your permitted personal information and view your contracted services & projects.'}
          </p>
        </div>

        {profile && (
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 font-mono">
              {profile.client_code}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-bold">
              {profile.account_status}
            </span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Client Self-Service Personal Info Form (strictly permitted fields only) */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-sky-400" />
          <h3 className="font-bold text-white">
            {language === 'ar' ? 'البيانات الشخصية' : 'Personal Information'}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              {language === 'ar' ? 'الاسم الكامل' : 'Full Name'}
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              {language === 'ar' ? 'البريد الإلكتروني (للقراءة فقط)' : 'Email (Read Only)'}
            </label>
            <input
              type="email"
              disabled
              value={profile?.email || user?.email || ''}
              className="w-full rounded-xl bg-slate-950/60 border border-slate-800 px-3.5 py-2.5 text-sm text-slate-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              {language === 'ar' ? 'رقم الهاتف' : 'Phone'}
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              {language === 'ar' ? 'اسم الشركة' : 'Company Name'}
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            {language === 'ar' ? 'العنوان' : 'Address'}
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-sm cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>
            {saving
              ? language === 'ar'
                ? 'جارٍ الحفظ...'
                : 'Saving...'
              : language === 'ar'
              ? 'حفظ البيانات'
              : 'Save Profile'}
          </span>
        </button>
      </form>

      {projectsError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{projectsError}</span>
        </div>
      )}

      <ClientOverallProgress projects={clientProjects} />
      <ClientProjectStatus
        projects={clientProjects}
        onRespondToApproval={respondToApproval}
      />
      <ClientInvoicesSection />
      <ClientMessagesSection />

      {/* Contracted Services */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-sky-400" />
          <h3 className="font-bold text-white">
            {language === 'ar' ? 'الخدمات المعينة' : 'Assigned Services'}
          </h3>
        </div>
        {!profile?.services || profile.services.length === 0 ? (
          <p className="text-sm text-slate-500">
            {language === 'ar' ? 'لا توجد خدمات معينة حالياً.' : 'No services assigned yet.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {profile.services.map((s) => (
              <span
                key={s.id}
                className="px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs font-semibold"
              >
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Existing Consultation Requests */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarCheck className="w-5 h-5 text-sky-400" />
          <h3 className="font-bold text-white">
            {language === 'ar' ? 'طلباتك' : 'Your Requests'}
          </h3>
        </div>
        {bookings.length === 0 ? (
          <p className="text-sm text-slate-500">
            {language === 'ar' ? 'لا توجد طلبات مسجلة حالياً.' : 'No requests found for your account.'}
          </p>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-sm"
              >
                <div>
                  <p className="font-bold text-white">{b.plan}</p>
                  <p className="text-xs text-slate-400">{b.businessType}</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 text-xs font-bold">
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientPortalPage;
