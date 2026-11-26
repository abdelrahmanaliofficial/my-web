import React from 'react';
import { BarChart3, Search, Target, Layers } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

const About: React.FC<{ isHomePage?: boolean }> = ({ isHomePage = true }) => {
  const { language, dir } = useLanguage();

  const skills = [
    {
      icon: Target,
      title: language === 'ar' ? 'مسارات التسويق' : 'Marketing Funnels',
      desc: language === 'ar' ? 'تصميم رحلة عميل متكاملة ترفع معدل التحويل.' : 'End-to-end customer acquisition & conversion funnels.',
    },
    {
      icon: Search,
      title: language === 'ar' ? 'تحسين محركات البحث SEO' : 'Technical & Content SEO',
      desc: language === 'ar' ? 'رفع ترتيب موقعك وجذب زيارات مجانية مستدامة.' : 'Sustainable organic search visibility and growth.',
    },
    {
      icon: BarChart3,
      title: language === 'ar' ? 'تحليل البيانات والأداء' : 'Growth Analytics',
      desc: language === 'ar' ? 'قرارات تسويقية مبنية على الأرقام وعائد الاستثمار.' : 'Data-backed attribution, ROAS optimization, and KPIs.',
    },
    {
      icon: Layers,
      title: language === 'ar' ? 'استشارات الأعمال' : 'Business Consulting',
      desc: language === 'ar' ? 'خطط توسع قابلة للتطبيق للشركات الناشئة والمتنامية.' : 'Actionable scaling roadmaps for startups & SMEs.',
    },
  ];

  return (
    <section className="py-20 max-w-5xl mx-auto px-4 scroll-mt-20" id="about" dir={dir}>
      <div className={`mb-10 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
        <span className="text-sky-500 text-sm font-bold tracking-wider">
          {language === 'ar' ? 'من أنا' : 'About Me'}
        </span>
        <h2 className={`text-3xl md:text-4xl font-bold mt-2 ${isHomePage ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
          {language === 'ar' ? 'من أنا' : 'About Me'}
        </h2>
      </div>

      <div
        className={`${
          isHomePage
            ? 'bg-slate-900/60 border-slate-800'
            : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
        } border rounded-2xl p-6 md:p-8 shadow-lg ${dir === 'rtl' ? 'text-right' : 'text-left'}`}
      >
        <p className={`${isHomePage ? 'text-slate-300' : 'text-slate-700 dark:text-slate-300'} text-sm md:text-base leading-relaxed mb-8`}>
          {language === 'ar'
            ? 'أنا أخصائي تسويق رقمي ومستشار أعمال مكرس لتحفيز النمو من خلال استراتيجيات مدعومة بالبيانات. بخبرة عميقة في مسارات التسويق، تحسين محركات البحث (SEO)، والاستشارات الاستراتيجية، أقوم بتمكين الشركات من التوسع المستدام وتحقيق نجاح ملموس.'
            : 'I am a digital marketing specialist and business consultant dedicated to driving growth through data-backed strategies. With deep expertise in marketing funnels, SEO, and strategic consulting, I empower businesses to scale sustainably and achieve measurable success.'}
        </p>

        <div className={`mt-8 border-t ${isHomePage ? 'border-slate-800' : 'border-slate-200 dark:border-slate-800'} pt-8`}>
          <h3 className={`text-xl md:text-2xl font-bold mb-2 ${isHomePage ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
            {language === 'ar' ? 'المهارات التقنية والتسويقية' : 'Technical & Marketing Skills'}
          </h3>
          <p className={`${isHomePage ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'} text-xs md:text-sm mb-8`}>
            {language === 'ar'
              ? 'أدوات وتقنيات أعتمد عليها لتقديم حلول متكاملة'
              : 'Tools and technologies I rely on to deliver integrated solutions'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {skills.map((skill) => {
              const Icon = skill.icon;
              return (
                <div
                  key={skill.title}
                  className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-start gap-3.5"
                >
                  <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-sky-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm mb-1">{skill.title}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">{skill.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
