import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

interface LogoProps {
  showText?: boolean;
}

const Logo: React.FC<LogoProps> = ({ showText = true }) => {
  const { language } = useLanguage();

  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/25 border border-white/20">
        <span className="font-black text-white text-base tracking-tighter">AA</span>
      </div>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-lg text-white tracking-tight">
            {language === 'ar' ? 'عبدالرحمن علي' : 'Abdelrahman Ali'}
          </span>
          <span className="text-[11px] font-medium text-sky-400">
            {language === 'ar' ? 'تسويق رقمي واستشارات' : 'Digital Marketing & Consulting'}
          </span>
        </div>
      )}
    </div>
  );
};

export default Logo;
