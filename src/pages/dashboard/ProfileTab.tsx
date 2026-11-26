import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient, extractApiError } from '../../lib/apiClient';

const ProfileTab: React.FC = () => {
  const { language, dir } = useLanguage();
  const { user, refreshUser } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!user) return null;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (newPassword !== confirmPassword) {
      setServerError(
        language === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'New passwords do not match.'
      );
      return;
    }

    setSavingPassword(true);
    try {
      await apiClient.get('/sanctum/csrf-cookie');
      await apiClient.put('/api/me/password', {
        current_password: currentPassword,
        password: newPassword,
        password_confirmation: confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(
        language === 'ar'
          ? 'تم تحديث كلمة المرور بنجاح.'
          : 'Password updated successfully.'
      );
      // Password persistence has already been confirmed by the API. Refreshing
      // the profile is best-effort and must not turn a successful password
      // change into a misleading failure toast.
      await refreshUser().catch(() => null);
    } catch (error) {
      const info = extractApiError(error, 'Failed to update password.');
      setServerError(info.message);
      toast.error(info.message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6" dir={dir}>
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {language === 'ar' ? 'الملف الشخصي الموثق' : 'Verified Account Profile'}
            </h2>
            <p className="text-xs text-slate-400">
              {language === 'ar'
                ? 'تتم مزامنة بيانات الحساب والصلاحيات مباشرة من الخادم'
                : 'Account details and permissions are synced directly from /api/me'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="block text-xs text-slate-400 mb-1">
              {language === 'ar' ? 'الاسم' : 'Name'}
            </span>
            <span className="font-bold text-white">{user.name}</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="block text-xs text-slate-400 mb-1">
              {language === 'ar' ? 'البريد الإلكتروني' : 'Email'}
            </span>
            <span className="font-bold text-white">{user.email}</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="block text-xs text-slate-400 mb-1">
              {language === 'ar' ? 'الدور الوظيفي' : 'Role'}
            </span>
            <span className="inline-flex items-center gap-1.5 font-bold text-sky-400">
              <ShieldCheck className="w-4 h-4" />
              {user.role}
            </span>
          </div>
        </div>

        {user.permissions.length > 0 && (
          <div className="mt-5 pt-5 border-t border-slate-800">
            <span className="block text-xs font-bold text-slate-400 mb-2">
              {language === 'ar' ? 'الصلاحيات الممنوحة' : 'Assigned Permissions'}
            </span>
            <div className="flex flex-wrap gap-2">
              {user.permissions.map((perm) => (
                <span
                  key={perm}
                  className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-mono"
                >
                  {perm}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={handlePasswordChange}
        className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4 max-w-xl"
      >
        <div className="flex items-center gap-2.5 mb-2">
          <KeyRound className="w-5 h-5 text-sky-400" />
          <h3 className="text-base font-bold text-white">
            {language === 'ar' ? 'تغيير كلمة المرور' : 'Update Password'}
          </h3>
        </div>

        {serverError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {serverError}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            {language === 'ar' ? 'كلمة المرور الحالية' : 'Current Password'}
          </label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            {language === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'}
          </label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            {language === 'ar' ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
          </label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
          />
        </div>

        <button
          type="submit"
          disabled={savingPassword}
          className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-sm cursor-pointer"
        >
          {savingPassword
            ? language === 'ar'
              ? 'جارٍ الحفظ...'
              : 'Updating...'
            : language === 'ar'
            ? 'حفظ كلمة المرور'
            : 'Update Password'}
        </button>
      </form>
    </div>
  );
};

export default ProfileTab;
