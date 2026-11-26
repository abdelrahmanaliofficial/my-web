import React from 'react';
import { Check } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface PricingProps {
  onSelectPlan?: (planName: string) => void;
}

const Pricing: React.FC<PricingProps> = ({ onSelectPlan }) => {
  const { language, dir } = useLanguage();

  const plans = [
    {
      id: 'starter',
      name_ar: 'باقة الانطلاق',
      name_en: 'Starter Audit',
      price: '$450',
      period_ar: 'دفعة واحدة',
      period_en: 'One-time',
      highlighted: false,
      features_ar: ['تدقيق شامل للحسابات والموقع', 'تحديد نقاط القوة والفرص', 'خطة عمل لمدة 30 يوم', 'جلسة استشارية 60 دقيقة'],
      features_en: ['Full funnel & website audit', 'Quick-win opportunity map', '30-day execution roadmap', '60-min strategy session'],
    },
    {
      id: 'growth',
      name_ar: 'باقة النمو المتكامل',
      name_en: 'Growth Marketing',
      price: '$1,200',
      period_ar: 'شهرياً',
      period_en: 'Per month',
      highlighted: true,
      features_ar: ['إدارة الحملات الإعلانية الممولة', 'تحسين محركات البحث SEO', 'تحسين صفحات الهبوط والتحويل', 'تقارير أداء أسبوعية ولوحة متابعة'],
      features_en: ['Paid acquisition management', 'Technical & on-page SEO', 'Landing page CRO optimization', 'Weekly KPI & ROAS reporting'],
    },
    {
      id: 'enterprise',
      name_ar: 'الباقة الاستراتيجية',
      name_en: 'Enterprise Strategy',
      price: '$2,500',
      period_ar: 'شهرياً',
      period_en: 'Per month',
      highlighted: false,
      features_ar: ['استشارات نمو وتوسع مستمرة', 'بناء وتطوير الموقع أو المتجر', 'تدريب فريق التسويق والمبيعات', 'دعم وأولوية تواصل مباشرة'],
      features_en: ['Fractional growth leadership', 'Custom web & funnel engineering', 'Team coaching & playbooks', 'Priority direct advisory'],
    },
  ];

  const handleChoose = (planName: string) => {
    if (onSelectPlan) {
      onSelectPlan(planName);
    }
    const contactEl = document.getElementById('contact');
    contactEl?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="py-24 scroll-mt-20 max-w-6xl mx-auto px-4" id="pricing" dir={dir}>
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-sky-500 text-sm font-bold tracking-wider uppercase">
          {language === 'ar' ? 'خطط العمل' : 'Plans'}
        </span>
        <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 mb-4">
          {language === 'ar' ? 'الباقات والأسعار' : 'Pricing & Plans'}
        </h2>
        <p className="text-slate-400 text-base md:text-lg">
          {language === 'ar'
            ? 'حلول مرنة لتناسب حجم أعمالك. اختر الباقة الأنسب عشان نكبر مشروعك سوا.'
            : 'Flexible solutions to fit your needs. Choose the perfect plan for your project.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const planTitle = language === 'ar' ? plan.name_ar : plan.name_en;
          const features = language === 'ar' ? plan.features_ar : plan.features_en;
          return (
            <div
              key={plan.id}
              className={`rounded-3xl p-8 flex flex-col border transition-all ${
                plan.highlighted
                  ? 'bg-gradient-to-b from-sky-950/60 to-slate-900 border-sky-500 shadow-2xl shadow-sky-500/10'
                  : 'bg-[#0f172a] border-slate-800 hover:border-sky-500/50'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">{planTitle}</h3>
                {plan.highlighted && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-500 text-slate-950">
                    {language === 'ar' ? 'الأكثر طلباً' : 'Popular'}
                  </span>
                )}
              </div>

              <div className="mb-6">
                <span className="text-4xl font-black text-white">{plan.price}</span>
                <span className="text-sm text-slate-400 ms-2">
                  / {language === 'ar' ? plan.period_ar : plan.period_en}
                </span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleChoose(plan.name_en)}
                className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                  plan.highlighted
                    ? 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                    : 'bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-white'
                }`}
              >
                {language === 'ar' ? 'احجز هذه الباقة' : 'Book This Plan'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default Pricing;
