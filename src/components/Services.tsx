import React from 'react';
import { ChevronRight, Cpu, Globe } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

const Services: React.FC<{ isHomePage?: boolean }> = ({ isHomePage = true }) => {
  const { language, dir } = useLanguage();

  const bgClass = isHomePage ? 'bg-transparent' : 'bg-slate-50 dark:bg-transparent';
  const titleClass = isHomePage ? 'text-white' : 'text-slate-900 dark:text-white';
  const textClass = isHomePage ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400';
  const cardClass = isHomePage
    ? 'bg-[#0f172a] border-slate-800'
    : 'bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 shadow-sm';

  return (
    <section className={`py-20 max-w-5xl mx-auto px-4 scroll-mt-20 ${bgClass}`} id="services" dir={dir}>
      <div className={`mb-12 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
        <span className="text-sky-500 text-sm font-bold tracking-wider">
          {language === 'ar' ? 'ما أقدمه' : 'What I Offer'}
        </span>
        <h2 className={`text-4xl md:text-5xl font-bold mt-2 ${titleClass}`}>
          {language === 'ar' ? 'خدماتي' : 'My Services'}
        </h2>
        <p className={`mt-4 text-sm md:text-base ${textClass}`}>
          {language === 'ar'
            ? 'حلول تسويقية وبرمجية مخصصة لنجاح أعمالك.'
            : 'Custom marketing and software solutions for your business success.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          className={`rounded-2xl p-6 border hover:border-sky-500 transition-colors flex flex-col ${cardClass} ${
            dir === 'rtl' ? 'items-start text-right' : 'items-start text-left'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-sky-950/50 flex items-center justify-center border border-sky-800/50 mb-6">
            <ChevronRight className={`text-sky-400 w-6 h-6 ${dir === 'rtl' ? 'rotate-180' : ''}`} />
          </div>
          <h3 className={`text-xl font-bold mb-3 ${titleClass}`}>
            {language === 'ar' ? 'تطوير الويب والتطبيقات' : 'Web & App Development'}
          </h3>
          <p className={`text-sm leading-relaxed ${textClass}`}>
            {language === 'ar'
              ? 'بناء تطبيقات ويب سريعة ومتجاوبة ومهيأة لمحركات البحث والتحويل.'
              : 'Building fast, conversion-focused, and scalable web applications.'}
          </p>
        </div>

        <div
          className={`rounded-2xl p-6 border hover:border-sky-500 transition-colors flex flex-col ${cardClass} ${
            dir === 'rtl' ? 'items-start text-right' : 'items-start text-left'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-sky-950/50 flex items-center justify-center border border-sky-800/50 mb-6">
            <Cpu className="text-sky-400 w-6 h-6" />
          </div>
          <h3 className={`text-xl font-bold mb-3 ${titleClass}`}>
            {language === 'ar' ? 'استراتيجية العلامة التجارية' : 'Brand Strategy'}
          </h3>
          <p className={`text-sm leading-relaxed ${textClass}`}>
            {language === 'ar'
              ? 'صياغة هوية قوية ورسائل تسويقية مميزة لعلامتك التجارية.'
              : 'Crafting a strong identity, positioning, and clear messaging for your brand.'}
          </p>
        </div>

        <div
          className={`rounded-2xl p-6 border hover:border-sky-500 transition-colors flex flex-col ${cardClass} ${
            dir === 'rtl' ? 'items-start text-right' : 'items-start text-left'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-sky-950/50 flex items-center justify-center border border-sky-800/50 mb-6">
            <Globe className="text-sky-400 w-6 h-6" />
          </div>
          <h3 className={`text-xl font-bold mb-3 ${titleClass}`}>
            {language === 'ar' ? 'التسويق الرقمي و SEO' : 'Digital Marketing & SEO'}
          </h3>
          <p className={`text-sm leading-relaxed ${textClass}`}>
            {language === 'ar'
              ? 'أدير الحملات الإعلانية المدفوعة وأحسن ظهور موقعك في نتائج البحث لزيادة الوصول لجمهورك المستهدف.'
              : 'Managing paid acquisition campaigns and SEO optimization to scale qualified traffic.'}
          </p>
        </div>
      </div>
    </section>
  );
};

export default Services;
