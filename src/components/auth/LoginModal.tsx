import React from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import LoginForm from './LoginForm';

const LoginModal: React.FC = () => {
  const { language, dir } = useLanguage();
  const { loginModalOpen, closeLoginModal } = useAuth();

  if (!loginModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={closeLoginModal}
      dir={dir}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl"
      >
        <button
          type="button"
          onClick={closeLoginModal}
          aria-label="Close login modal"
          className="absolute top-4 end-4 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              {language === 'ar' ? 'تسجيل الدخول' : 'Account Sign In'}
            </h2>
            <p className="text-xs text-slate-400">
              {language === 'ar'
                ? 'مصادقة آمنة عبر الجلسات المحمية'
                : 'Authenticated via secure server session'}
            </p>
          </div>
        </div>

        <LoginForm onSuccess={closeLoginModal} />
      </div>
    </div>
  );
};

export default LoginModal;
