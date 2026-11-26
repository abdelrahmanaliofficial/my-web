import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useSettings } from '../contexts/SettingsContext';

const Hero: React.FC = () => {
  const { language, dir } = useLanguage();
  const { heroMedia } = useSettings();

  const bgImage =
    heroMedia.image_path ||
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop';

  return (
    <section
      className="relative w-full min-h-screen flex items-center justify-center overflow-hidden py-28"
      id="home"
      dir={dir}
    >
      {heroMedia.active_media_type === 'video' && heroMedia.video_path ? (
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
          src={heroMedia.video_path}
        />
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0"
          style={{ backgroundImage: `url('${bgImage}')` }}
        />
      )}

      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-[2px] z-0" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center flex flex-col items-center">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs sm:text-sm font-bold mb-6">
          {language === 'ar'
            ? 'أخصائي تسويق رقمي ومستشار أعمال'
            : 'Digital Marketing Specialist & Business Consultant'}
        </span>

        <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white mb-6 leading-tight drop-shadow-md">
          {language === 'ar' ? 'أبني مستقبلك' : 'Build Your Digital'} <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-l from-sky-400 to-blue-500">
            {language === 'ar' ? '"الرقمي"' : '"Future"'}
          </span>
        </h1>

        <p className="text-slate-300 text-xl md:text-2xl mb-10 max-w-2xl leading-relaxed">
          {language === 'ar'
            ? 'أنا عبدالرحمن علي، أخصائي تسويق رقمي ومستشار أعمال متخصص في بناء استراتيجيات النمو والتسويق الرقمي وحلول الويب المتكاملة.'
            : 'I am Abdelrahman Ali, a Digital Marketing Specialist & Business Consultant dedicated to scaling brands with data-driven growth strategies and modern web solutions.'}
        </p>

        <div
          className={`flex flex-col sm:flex-row ${
            dir === 'rtl' ? 'sm:flex-row-reverse' : ''
          } items-center justify-center gap-6 w-full sm:w-auto`}
        >
          <Link
            to="/contact"
            className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-lg py-4 px-10 rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(14,165,233,0.4)] hover:shadow-[0_0_25px_rgba(14,165,233,0.6)] hover:-translate-y-1 w-full sm:w-auto text-center"
          >
            {language === 'ar' ? 'تواصل معي' : 'Contact Me'}
          </Link>

          <Link
            to="/portfolio"
            className="bg-transparent border border-slate-700 hover:border-sky-500 hover:bg-white/5 text-white font-bold text-lg py-4 px-10 rounded-full transition-all hover:-translate-y-1 duration-300 w-full sm:w-auto text-center"
          >
            {language === 'ar' ? 'عرض الأعمال' : 'View Portfolio'}
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Hero;
