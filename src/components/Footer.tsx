import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import Logo from './Logo';

const Footer: React.FC = () => {
  const { language, dir } = useLanguage();
  const { settings } = useSettings();
  const { user } = useAuth();
  const [email, setEmail] = useState('');

  const defaultLogo = settings?.appearance?.logo_url || null;
  const logoDark = settings?.appearance?.logo_dark_url || null;
  const logoUrl = logoDark || defaultLogo;
  const logoDisplay = settings?.appearance?.logo_display || 'logo_and_text';
  const defaultText = language === 'ar' ? 'عبدالرحمن علي' : 'Abdelrahman Ali';

  const renderBrand = () => {
    if (logoDisplay === 'hidden') return null;

    if (!logoUrl) {
      if (logoDisplay === 'text_only') {
        return <span className="font-bold text-xl text-white tracking-tight">{defaultText}</span>;
      }
      if (logoDisplay === 'logo_only') {
        return <Logo showText={false} />;
      }
      return <Logo />;
    }

    if (logoDisplay === 'text_only') {
      return <span className="font-bold text-xl text-white tracking-tight">{defaultText}</span>;
    }

    if (logoDisplay === 'logo_only') {
      return <img src={logoUrl} alt="Brand Logo" className="h-10 md:h-12 w-auto object-contain" />;
    }

    return (
      <>
        <img src={logoUrl} alt="Brand Logo" className="h-10 md:h-12 w-auto object-contain" />
        <span className="font-bold text-xl text-white tracking-tight">{defaultText}</span>
      </>
    );
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    try {
      await axios.post('/api/subscribe', { email });
      toast.success(language === 'ar' ? 'تم الاشتراك في النشرة بنجاح!' : 'Subscribed successfully!');
      setEmail('');
    } catch {
      toast.error(language === 'ar' ? 'تعذر الاشتراك حالياً.' : 'Subscription failed.');
    }
  };

  return (
    <footer className="border-t border-white/10 bg-slate-950 py-14" dir={dir}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div className="space-y-4">
          <div className="flex items-center gap-3">{renderBrand()}</div>
          <p className="text-sm text-slate-400 leading-relaxed">
            {language === 'ar'
              ? 'مساعدة العلامات التجارية والشركات الناشئة على التوسع المستدام عبر التسويق الرقمي وتطوير الويب.'
              : 'Helping brands and startups scale sustainably through data-driven digital marketing and web solutions.'}
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-bold uppercase tracking-wider text-white">
            {language === 'ar' ? 'روابط سريعة' : 'Quick Links'}
          </h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><Link to="/" className="hover:text-sky-400 transition-colors">{language === 'ar' ? 'الرئيسية' : 'Home'}</Link></li>
            <li><Link to="/portfolio" className="hover:text-sky-400 transition-colors">{language === 'ar' ? 'أعمالي' : 'Portfolio'}</Link></li>
            <li><Link to="/contact" className="hover:text-sky-400 transition-colors">{language === 'ar' ? 'تواصل معي' : 'Contact'}</Link></li>
            <li>
              <Link
                to={!user ? '/login' : user.role === 'client' ? '/client' : '/dashboard'}
                className="hover:text-sky-400 transition-colors"
              >
                {!user
                  ? language === 'ar'
                    ? 'تسجيل الدخول'
                    : 'Sign In'
                  : user.role === 'client'
                  ? language === 'ar'
                    ? 'حسابي'
                    : 'My Account'
                  : language === 'ar'
                  ? 'لوحة التحكم'
                  : 'Dashboard'}
              </Link>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-bold uppercase tracking-wider text-white">
            {language === 'ar' ? 'النشرة البريدية' : 'Newsletter'}
          </h4>
          <p className="text-xs text-slate-400">
            {language === 'ar'
              ? 'احصل على أحدث نصائح النمو والتسويق الرقمي.'
              : 'Get curated growth & digital marketing insights.'}
          </p>
          <form onSubmit={handleSubscribe} className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={language === 'ar' ? 'بريدك الإلكتروني' : 'your@email.com'}
              className="flex-1 min-w-0 rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-colors cursor-pointer"
            >
              {language === 'ar' ? 'اشترك' : 'Join'}
            </button>
          </form>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 pt-6 border-t border-white/5 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {defaultText}. {language === 'ar' ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}
      </div>
    </footer>
  );
};

export default Footer;
