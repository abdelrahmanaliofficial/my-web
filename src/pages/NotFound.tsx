import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

const NotFound: React.FC = () => {
  const { language, dir } = useLanguage();

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4 pt-20" dir={dir}>
      <div className="text-center max-w-md">
        <span className="text-6xl font-black text-sky-500 block mb-4">404</span>
        <h1 className="text-2xl font-bold text-white mb-3">
          {language === 'ar' ? 'الصفحة غير موجودة' : 'Page Not Found'}
        </h1>
        <p className="text-slate-400 text-sm mb-8">
          {language === 'ar'
            ? 'عذراً، لم نتمكن من العثور على الصفحة التي تبحث عنها.'
            : 'Sorry, we could not find the page you are looking for.'}
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-colors"
        >
          {language === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
