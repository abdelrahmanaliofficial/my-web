import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ShieldCheck, KeyRound, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { apiClient, extractApiError } from '../lib/apiClient';

interface VerifiedInvitation {
  client_code: string;
  full_name: string;
  email: string;
  company_name?: string | null;
  expires_at: string;
}

const AcceptInvitationPage: React.FC = () => {
  const { language, dir } = useLanguage();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fragmentParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const token = (searchParams.get('token') || fragmentParams.get('token') || '').trim();

  const [verifying, setVerifying] = useState(true);
  const [invitation, setInvitation] = useState<VerifiedInvitation | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifyError(
        language === 'ar'
          ? 'رابط الدعوة مفقود أو غير صالح.'
          : 'Invitation token is missing or invalid.'
      );
      setVerifying(false);
      return;
    }

    // New invitation links carry the token in the URL fragment. Exchange it via
    // a POST body instead of putting the secret in an API query string.
    if (location.hash.includes('token=')) {
      window.history.replaceState({}, document.title, `${location.pathname}${location.search}`);
    }

    apiClient
      .get('/sanctum/csrf-cookie')
      .then(() => apiClient.post('/api/client-invitations/verify', { token }))
      .then((res) => {
        if (res.data?.data) {
          setInvitation(res.data.data);
        } else {
          setVerifyError('Unable to verify invitation.');
        }
      })
      .catch((err) => {
        const info = extractApiError(err, 'This invitation link is invalid or has expired.');
        setVerifyError(info.message);
      })
      .finally(() => {
        setVerifying(false);
      });
  }, [token, language, location.hash, location.pathname, location.search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (password !== passwordConfirmation) {
      setSubmitError(
        language === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.get('/sanctum/csrf-cookie');
      await apiClient.post('/api/client-invitations/accept', {
        token,
        password,
        password_confirmation: passwordConfirmation,
      });
      setPassword('');
      setPasswordConfirmation('');
      setActivated(true);
      toast.success(
        language === 'ar' ? 'تم تفعيل حسابك بنجاح!' : 'Your account has been activated!'
      );
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      const info = extractApiError(err, 'Failed to complete account setup.');
      setSubmitError(info.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-slate-950 flex items-center justify-center px-4 pt-28 pb-20"
      dir={dir}
    >
      <div className="w-full max-w-md glass-card rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">
              {language === 'ar' ? 'تفعيل حساب العميل' : 'Activate Client Account'}
            </h1>
            <p className="text-xs text-slate-400">
              {language === 'ar'
                ? 'قم بتعيين كلمة المرور لإكمال تفعيل حسابك'
                : 'Set a secure password to activate your portal access'}
            </p>
          </div>
        </div>

        {verifying ? (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
            <span>{language === 'ar' ? 'جارٍ التحقق من الرابط...' : 'Verifying invitation...'}</span>
          </div>
        ) : verifyError ? (
          <div className="space-y-4">
            <div
              role="alert"
              className="flex items-start gap-2.5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{verifyError}</span>
            </div>
            <Link
              to="/login"
              className="block text-center py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-bold text-white"
            >
              {language === 'ar' ? 'العودة لتسجيل الدخول' : 'Return to Sign In'}
            </Link>
          </div>
        ) : activated ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>
              {language === 'ar'
                ? 'تم تفعيل حسابك بنجاح! يتم تحويلك لتسجيل الدخول...'
                : 'Account activated! Redirecting to sign in...'}
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {invitation && (
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{invitation.full_name}</span>
                  <span className="font-mono text-sky-400">{invitation.client_code}</span>
                </div>
                <p className="text-slate-400">{invitation.email}</p>
              </div>
            )}

            {submitError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs"
              >
                {submitError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {language === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'}
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3.5" />
                <input
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-10 pe-3.5 py-2.5 text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {language === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm Password'}
              </label>
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-sm cursor-pointer"
            >
              {submitting
                ? language === 'ar'
                  ? 'جارٍ التفعيل...'
                  : 'Activating...'
                : language === 'ar'
                ? 'تفعيل الحساب'
                : 'Complete Setup & Activate'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
};

export default AcceptInvitationPage;
