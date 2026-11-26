import React from 'react';
import { Quote } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

const Testimonials: React.FC = () => {
  const { language, dir } = useLanguage();

  const items = [
    {
      id: 1,
      name: language === 'ar' ? 'محمد العتيبي' : 'Mohammed Al-Otaibi',
      role: language === 'ar' ? 'مؤسس متجر رقمي' : 'E-Commerce Founder',
      quote:
        language === 'ar'
          ? 'تضاعفت مبيعاتنا خلال أول شهرين بفضل إعادة بناء مسار الإعلانات وتحسين صفحة الدفع.'
          : 'Our sales doubled within the first two months after rebuilding our ad funnel and checkout flow.',
    },
    {
      id: 2,
      name: language === 'ar' ? 'ليلى منصور' : 'Layla Mansour',
      role: language === 'ar' ? 'مديرة التسويق - SaaS' : 'Head of Marketing, SaaS',
      quote:
        language === 'ar'
          ? 'دقة عالية في قراءة البيانات وتحويلها إلى خطوات عملية واضحة ومربحة.'
          : 'Exceptional analytical clarity—turned complex metrics into clear, profitable growth actions.',
    },
  ];

  return (
    <section className="py-20 scroll-mt-20 max-w-5xl mx-auto px-4" id="testimonials" dir={dir}>
      <div className={`mb-12 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
        <span className="text-sky-500 text-sm font-bold tracking-wider">
          {language === 'ar' ? 'آراء العملاء' : 'Testimonials'}
        </span>
        <h2 className="text-3xl md:text-4xl font-bold text-white mt-2">
          {language === 'ar' ? 'ماذا يقول شركاء النجاح' : 'What Clients Say'}
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {items.map((item) => (
          <div key={item.id} className="glass-card rounded-2xl p-6 md:p-8 flex flex-col justify-between">
            <div>
              <Quote className="w-8 h-8 text-sky-400/50 mb-4" />
              <p className="text-slate-300 leading-relaxed mb-6">{item.quote}</p>
            </div>
            <div>
              <p className="font-bold text-white">{item.name}</p>
              <p className="text-xs text-sky-400">{item.role}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Testimonials;
