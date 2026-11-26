import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Mail, AlertCircle, LogIn } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { User } from '../../types/auth';

interface LoginFormProps {
  onSuccess?: (user: User) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const { language, dir } = useLanguage();
  const { login, authenticating, authError, sessionExpired, clearErrors, closeLoginModal } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const authenticatedUser = await login({ email, password, remember });
      setPassword('');
      onSuccess?.(authenticatedUser);
    } catch {
      setPassword('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" dir={dir}>
      {sessionExpired && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {language === 'ar'
              ? 'انتهت صلاحية جلستك. يرجى تسجيل الدخول مرة أخرى.'
              : 'Your session has expired. Please sign in again.'}
          </span>
        </div>
      )}

      {authError && !sessionExpired && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{authError}</span>
        </div>
      )}

      <div>
        <label htmlFor="auth-email" className="block text-sm font-semibold text-slate-300 mb-2">
          {language === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}
        </label>
        <div className="relative">
          <Mail className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3.5" />
          <input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              if (authError) clearErrors();
              setEmail(e.target.value);
            }}
            placeholder="name@company.com"
            className="w-full rounded-xl bg-slate-950/80 border border-slate-800 ps-10 pe-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="auth-password" className="block text-sm font-semibold text-slate-300 mb-2">
          {language === 'ar' ? 'كلمة المرور' : 'Password'}
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3.5" />
          <input
            id="auth-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              if (authError) clearErrors();
              setPassword(e.target.value);
            }}
            placeholder="••••••••"
            className="w-full rounded-xl bg-slate-950/80 border border-slate-800 ps-10 pe-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Link to="/forgot-password" onClick={closeLoginModal} className="text-xs font-semibold text-sky-400 hover:text-sky-300">
          {language === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
        </Link>
      </div>

      <label className="flex items-center gap-2.5 text-xs text-slate-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
        />
        <span>{language === 'ar' ? 'تذكر الجلسة' : 'Keep me signed in'}</span>
      </label>

      <button
        type="submit"
        disabled={authenticating}
        className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-sm transition-colors cursor-pointer"
      >
        <LogIn className="w-4 h-4" />
        <span>
          {authenticating
            ? language === 'ar'
              ? 'جارٍ التحقق...'
              : 'Signing in...'
            : language === 'ar'
            ? 'تسجيل الدخول'
            : 'Sign In'}
        </span>
      </button>
    </form>
  );
};

export default LoginForm;
