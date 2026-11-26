import React, { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertCircle, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { apiClient, extractApiError } from '../lib/apiClient';

const ResetPasswordPage: React.FC = () => {
  const { language, dir } = useLanguage();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!token || !email) {
      setError(language === 'ar' ? 'رابط إعادة تعيين كلمة المرور غير مكتمل.' : 'The password reset link is incomplete.');
      return;
    }
    if (password.length < 12 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError(language === 'ar' ? 'استخدم كلمة مرور لا تقل عن 12 حرفًا وتحتوي على حروف وأرقام.' : 'Use at least 12 characters containing letters and numbers.');
      return;
    }
    if (password !== confirmation) {
      setError(language === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.get('/sanctum/csrf-cookie');
      await apiClient.post('/api/password/reset', {
        token,
        email,
        password,
        password_confirmation: confirmation,
      });
      setPassword('');
      setConfirmation('');
      toast.success(language === 'ar' ? 'تم تعيين كلمة المرور. يمكنك تسجيل الدخول الآن.' : 'Password set successfully. You can sign in now.');
      navigate('/login', { replace: true });
    } catch (requestError) {
      const info = extractApiError(requestError, language === 'ar' ? 'تعذر تعيين كلمة المرور.' : 'Unable to reset password.');
      setError(info.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4 pt-28 pb-20" dir={dir}>
      <div className="w-full max-w-md glass-card rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">{language === 'ar' ? 'تعيين كلمة المرور' : 'Set Your Password'}</h1>
            <p className="text-xs text-slate-400">{email}</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">{language === 'ar' ? 'كلمة المرور الجديدة' : 'New password'}</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3.5" />
              <input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-10 pe-3.5 py-2.5 text-sm text-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">{language === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm password'}</label>
            <input type="password" required minLength={12} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white" />
          </div>
          <button type="submit" disabled={submitting || !token || !email} className="w-full inline-flex justify-center items-center gap-2 px-5 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-sm">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {language === 'ar' ? 'حفظ كلمة المرور' : 'Save password'}
          </button>
        </form>
        <Link to="/login" className="block text-center text-sm text-sky-400 hover:text-sky-300">{language === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to login'}</Link>
      </div>
    </main>
  );
};

export default ResetPasswordPage;
