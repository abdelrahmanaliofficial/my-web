import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface Project {
  id: number;
  category: 'marketing' | 'web' | 'consulting';
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  image: string;
  tags: string[];
  metrics: string;
}

const projects: Project[] = [
  {
    id: 1,
    category: 'marketing',
    title_ar: 'حملة نمو متجر إلكتروني',
    title_en: 'E-Commerce Growth Funnel',
    description_ar: 'إعادة هيكلة مسار الإعلانات المدفوعة وتحسين صفحات الهبوط لزيادة العائد على الإنفاق الإعلاني 4.2x.',
    description_en: 'Restructured paid acquisition funnels and landing pages to achieve a 4.2x ROAS scale-up.',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1200&auto=format&fit=crop',
    tags: ['Performance Ads', 'CRO', 'Meta & Google'],
    metrics: '+320% Revenue Growth',
  },
  {
    id: 2,
    category: 'web',
    title_ar: 'منصة حجوزات وخدمات SaaS',
    title_en: 'SaaS Booking & Analytics Platform',
    description_ar: 'تطوير منصة متكاملة ثنائية اللغة مع لوحة تحكم للإحصائيات وإدارة العملاء المحتملين.',
    description_en: 'Built a bilingual SaaS web application with real-time conversion analytics and CRM tools.',
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200&auto=format&fit=crop',
    tags: ['React', 'TypeScript', 'SEO'],
    metrics: '98 Lighthouse Score',
  },
  {
    id: 3,
    category: 'consulting',
    title_ar: 'استراتيجية توسع لشركة ناشئة',
    title_en: 'Startup Market Expansion Roadmap',
    description_ar: 'إعداد خطة دخول السوق وبناء نموذج التسعير وهيكلة فريق المبيعات والتسويق.',
    description_en: 'Go-to-market strategy, pricing architecture, and growth team enablement for MENA expansion.',
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=1200&auto=format&fit=crop',
    tags: ['GTM Strategy', 'Pricing', 'B2B'],
    metrics: '3x Qualified Leads',
  },
];

const Portfolio: React.FC<{ isHomePage?: boolean }> = ({ isHomePage = true }) => {
  const { language, dir } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<'all' | 'marketing' | 'web' | 'consulting'>('all');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const categories: Array<'all' | 'marketing' | 'web' | 'consulting'> = ['all', 'marketing', 'web', 'consulting'];

  const categoryLabels: Record<string, { ar: string; en: string }> = {
    all: { ar: 'الكل', en: 'All' },
    marketing: { ar: 'التسويق', en: 'Marketing' },
    web: { ar: 'تطوير الويب', en: 'Web' },
    consulting: { ar: 'الاستشارات', en: 'Consulting' },
  };

  const filtered = activeCategory === 'all' ? projects : projects.filter((p) => p.category === activeCategory);

  return (
    <section className="py-24 scroll-mt-20 max-w-6xl mx-auto px-4" id="portfolio" dir={dir}>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
        <div>
          <span className="text-sky-500 font-mono text-sm tracking-widest uppercase mb-4 block">
            {language === 'ar' ? 'أعمالي' : 'My Work'}
          </span>
          <h2 className={`text-4xl md:text-5xl font-black tracking-tight mb-4 leading-tight ${isHomePage ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
            {language === 'ar' ? 'مشاريع مختارة' : 'Selected Projects'}
          </h2>
          <p className="text-slate-400 text-lg max-w-xl leading-relaxed">
            {language === 'ar'
              ? 'نماذج من المشاريع والحملات التي ساهمت في نموها وتحقيق نتائج ملموسة.'
              : 'Selected case studies across digital growth, web engineering, and strategic consulting.'}
          </p>
        </div>

        <div
          className={`flex flex-wrap gap-2 p-2 backdrop-blur-md rounded-2xl border ${
            isHomePage ? 'bg-slate-900/50 border-white/5' : 'bg-white dark:bg-slate-900/50 border-slate-200 dark:border-white/5'
          }`}
        >
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer ${
                activeCategory === cat
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
                  : isHomePage
                  ? 'text-slate-400 hover:text-white hover:bg-white/5'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {language === 'ar' ? categoryLabels[cat].ar : categoryLabels[cat].en}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <AnimatePresence mode="popLayout">
          {filtered.map((project) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.35 }}
              key={project.id}
              onClick={() => setSelectedProject(project)}
              className={`group relative rounded-[2rem] overflow-hidden cursor-pointer ${
                isHomePage
                  ? 'glass-card'
                  : 'bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-sky-500'
              }`}
            >
              <div className="aspect-[4/3] w-full relative overflow-hidden bg-slate-900/50">
                <img
                  src={project.image}
                  alt={language === 'ar' ? project.title_ar : project.title_en}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 end-3 px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md text-sky-400 text-xs font-bold border border-sky-500/30">
                  {project.metrics}
                </div>
              </div>

              <div className="p-7">
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  {project.tags.slice(0, 2).map((tag, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 text-xs font-mono text-sky-400 bg-sky-500/10 rounded-full border border-sky-500/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <h3 className={`text-xl font-bold mb-2 group-hover:text-sky-400 transition-colors ${isHomePage ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  {language === 'ar' ? project.title_ar : project.title_en}
                </h3>
                <p className={`text-sm line-clamp-2 ${isHomePage ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400'}`}>
                  {language === 'ar' ? project.description_ar : project.description_en}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedProject(null)}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              className={`relative w-full max-w-4xl border rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row ${
                isHomePage ? 'bg-[#0f172a] border-slate-800' : 'bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedProject(null)}
                className="absolute top-4 end-4 z-50 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>

              <div className="w-full md:w-1/2 aspect-[4/3] md:aspect-auto bg-slate-950">
                <img
                  src={selectedProject.image}
                  alt={language === 'ar' ? selectedProject.title_ar : selectedProject.title_en}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center max-h-[80vh] overflow-y-auto">
                <span className="text-xs font-bold text-sky-400 uppercase tracking-widest mb-2">
                  {selectedProject.metrics}
                </span>
                <h3 className={`text-2xl md:text-3xl font-bold mb-4 ${isHomePage ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  {language === 'ar' ? selectedProject.title_ar : selectedProject.title_en}
                </h3>
                <p className={`mb-8 leading-relaxed ${isHomePage ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400'}`}>
                  {language === 'ar' ? selectedProject.description_ar : selectedProject.description_en}
                </p>

                <div className="flex flex-wrap gap-2 mb-8 mt-auto">
                  {selectedProject.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 text-xs font-mono text-sky-400 bg-sky-500/10 rounded-full border border-sky-500/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <a
                  href="#contact"
                  onClick={() => setSelectedProject(null)}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-colors"
                >
                  <span>{language === 'ar' ? 'اطلب مشروعاً مشابهاً' : 'Request Similar Project'}</span>
                  <ExternalLink size={16} />
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default Portfolio;
