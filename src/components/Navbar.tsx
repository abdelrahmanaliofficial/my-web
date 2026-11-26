import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Globe, Moon, Sun, LayoutDashboard, LogIn } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import Logo from './Logo';

const Navbar: React.FC = () => {
  const { language, toggleLanguage, dir } = useLanguage();
  const { settings, darkMode, toggleDarkMode } = useSettings();
  const { user, openLoginModal } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const defaultLogo = settings?.appearance?.logo_url || null;
  const logoDark = settings?.appearance?.logo_dark_url || null;
  const logoUrl = logoDark || defaultLogo;
  const logoDisplay = settings?.appearance?.logo_display || 'logo_and_text';
  const defaultText = language === 'ar' ? 'عبدالرحمن علي' : 'Abdelrahman Ali';
  const portalPath = user?.role === 'client' ? '/client' : '/dashboard';

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
      return <img src={logoUrl} alt="Brand Logo" className="h-10 md:h-12 w-auto object-contain drop-shadow-sm" />;
    }

    return (
      <>
        <img src={logoUrl} alt="Brand Logo" className="h-10 md:h-12 w-auto object-contain drop-shadow-sm" />
        <span className="font-bold text-xl text-white tracking-tight hidden sm:block">{defaultText}</span>
      </>
    );
  };

  const navItems = [
    { href: '/#home', label: language === 'ar' ? 'الرئيسية' : 'Home' },
    { href: '/#about', label: language === 'ar' ? 'من أنا' : 'About' },
    { href: '/#services', label: language === 'ar' ? 'خدماتي' : 'Services' },
    { href: '/portfolio', label: language === 'ar' ? 'أعمالي' : 'Portfolio' },
    { href: '/#pricing', label: language === 'ar' ? 'الباقات' : 'Pricing' },
    { href: '/contact', label: language === 'ar' ? 'تواصل معي' : 'Contact' },
  ];

  return (
    <header
      dir={dir}
      className="fixed top-0 inset-x-0 z-50 bg-slate-950/85 backdrop-blur-xl border-b border-white/10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          {renderBrand()}
        </Link>

        <nav className="hidden lg:flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return item.href.startsWith('/#') ? (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-semibold text-slate-300 hover:text-sky-400 transition-colors"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                to={item.href}
                className={`text-sm font-semibold transition-colors ${
                  isActive ? 'text-sky-400' : 'text-slate-300 hover:text-sky-400'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleLanguage}
            aria-label="Toggle Language"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-sky-500/50 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
          >
            <Globe className="w-4 h-4 text-sky-400" />
            <span>{language === 'ar' ? 'EN' : 'عربي'}</span>
          </button>

          <button
            type="button"
            onClick={toggleDarkMode}
            aria-label="Toggle Theme"
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-sky-500/50 text-slate-200 transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-400" />}
          </button>

          {user ? (
            <Link
              to={portalPath}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500/10 border border-sky-500/30 hover:bg-sky-500/20 text-sky-400 text-xs font-bold transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>
                {user.role === 'client'
                  ? language === 'ar'
                    ? 'حسابي'
                    : 'My Account'
                  : language === 'ar'
                  ? 'لوحة التحكم'
                  : 'Dashboard'}
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={openLoginModal}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500/10 border border-sky-500/30 hover:bg-sky-500/20 text-sky-400 text-xs font-bold transition-colors cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{language === 'ar' ? 'دخول' : 'Sign In'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden bg-slate-950/95 border-b border-white/10 px-4 py-4 space-y-2">
          {navItems.map((item) =>
            item.href.startsWith('/#') ? (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-200 hover:bg-slate-900 hover:text-sky-400"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-200 hover:bg-slate-900 hover:text-sky-400"
              >
                {item.label}
              </Link>
            )
          )}
          {user ? (
            <Link
              to={portalPath}
              onClick={() => setMobileOpen(false)}
              className="block px-4 py-2.5 rounded-xl text-sm font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20"
            >
              {user.role === 'client'
                ? language === 'ar'
                  ? 'حسابي'
                  : 'My Account'
                : language === 'ar'
                ? 'لوحة التحكم'
                : 'Dashboard'}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                openLoginModal();
              }}
              className="w-full text-start px-4 py-2.5 rounded-xl text-sm font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 cursor-pointer"
            >
              {language === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
            </button>
          )}
        </div>
      )}
    </header>
  );
};

export default Navbar;
