import React, { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertCircle, Mail, ShieldCheck, Loader2 } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { apiClient, extractApiError } from '../lib/apiClient';

const ForgotPasswordPage: React.FC = () => {
  const { language, dir } = useLanguage();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.get('/sanctum/csrf-cookie');
      await apiClient.post('/api/password/forgot', { email: email.trim() });
      setSubmitted(true);
      toast.success(language === 'ar' ? 'تم استلام الطلب. راجع بريدك إذا كان الحساب مسجلًا.' : 'Request received. Check your email if the account is registered.');
    } catch (requestError) {
      const info = extractApiError(requestError, language === 'ar' ? 'تعذر إرسال رابط إعادة التعيين.' : 'Unable to send the reset link.');
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
            <h1 className="text-xl font-black text-white">{language === 'ar' ? 'استعادة كلمة المرور' : 'Reset Password'}</h1>
            <p className="text-xs text-slate-400">{language === 'ar' ? 'أدخل بريد حسابك لإرسال رابط آمن لإعادة التعيين.' : 'Enter your account email to request a secure reset link.'}</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {submitted ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
            {language === 'ar'
              ? 'إذا كان البريد مرتبطًا بحساب، فستصلك رسالة تحتوي على رابط إعادة تعيين صالح لفترة محدودة.'
              : 'If this email belongs to an account, a time-limited password reset link will be sent.'}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-300 mb-1.5">{language === 'ar' ? 'البريد الإلكتروني' : 'Email address'}</span>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3.5" />
                <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-10 pe-3.5 py-2.5 text-sm text-white" placeholder="name@company.com" />
              </div>
            </label>
            <button type="submit" disabled={submitting} className="w-full inline-flex justify-center items-center gap-2 px-5 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-sm">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {language === 'ar' ? 'إرسال رابط الاستعادة' : 'Send reset link'}
            </button>
          </form>
        )}

        <Link to="/login" className="block text-center text-sm text-sky-400 hover:text-sky-300">{language === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to login'}</Link>
      </div>
    </main>
  );
};

export default ForgotPasswordPage;
