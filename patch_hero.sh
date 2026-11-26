cat << 'INNER_EOF' > src/components/Hero.tsx
import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

const Hero = () => {
  const { language, dir } = useLanguage();

  return (
    <section className="relative w-full min-h-screen flex items-center justify-center overflow-hidden py-20" id="home" dir={dir}>
      
      {/* صورة الخلفية */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop')" }}
      ></div>
      
      {/* طبقة التعتيم (Overlay) للحفاظ على وضوح النص */}
      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-[2px] z-0"></div>

      {/* محتوى القسم الرئيسي */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center flex flex-col items-center">
        
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white mb-6 leading-tight drop-shadow-md">
          {language === 'ar' ? 'أبني مستقبلك' : 'Build Your Digital'} <br /> <span className="text-transparent bg-clip-text bg-gradient-to-l from-sky-400 to-blue-500">
            {language === 'ar' ? '"الرقمي"' : '"Future"'}
          </span>
        </h1>

        <p className="text-slate-300 text-xl md:text-2xl mb-10 max-w-2xl leading-relaxed">
          {language === 'ar' 
            ? 'أنا عبدالرحمن، مطور برمجيات متخصص في بناء تطبيقات ويب وعملية الاستخدام لأحدث التقنيات.' 
            : 'I am Abdelrahman, a software developer specializing in building scalable web applications using the latest technologies.'}
        </p>

        {/* تم تحويل الأزرار إلى روابط (a tags) مع إضافة href للتوجيه الصحيح */}
        <div className={`flex ${dir === 'rtl' ? 'flex-row-reverse' : 'flex-row'} items-center justify-center gap-6 w-full sm:w-auto`}>
          <a 
            href="/contact" 
            className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-lg py-4 px-10 rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(14,165,233,0.4)] hover:shadow-[0_0_25px_rgba(14,165,233,0.6)] hover:-translate-y-1 w-full sm:w-auto text-center"
          >
            {language === 'ar' ? 'تواصل معي' : 'Contact Me'}
          </a>
          
          <a 
            href="/portfolio" 
            className="bg-transparent border border-slate-700 hover:border-sky-500 hover:bg-white/5 text-white font-bold text-lg py-4 px-10 rounded-full transition-all hover:-translate-y-1 duration-300 w-full sm:w-auto text-center"
          >
            {language === 'ar' ? 'عرض الأعمال' : 'View Portfolio'}
          </a>
        </div>
        
      </div>
      
    </section>
  );
};

export default Hero;
INNER_EOF
