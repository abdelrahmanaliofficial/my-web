import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

interface Partner {
  id: number;
  name: string;
  url?: string;
}

const partners: Partner[] = [
  { id: 1, name: 'NovaCommerce' },
  { id: 2, name: 'Skyline Tech' },
  { id: 3, name: 'Al-Noor Group' },
  { id: 4, name: 'Pulse Media' },
  { id: 5, name: 'Vertex Ventures' },
];

const TrustedBy: React.FC = () => {
  const { language, dir } = useLanguage();

  return (
    <section className="py-14 border-y border-white/5 bg-slate-950/60" dir={dir}>
      <div className="max-w-6xl mx-auto px-6">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400 mb-8">
          {language === 'ar' ? 'شركاء النجاح والعلامات التجارية' : 'Trusted By Growing Brands & Partners'}
        </p>
        <div className="flex flex-wrap justify-center items-center gap-6">
          {partners.map((partner) => (
            <div
              key={partner.id}
              className="px-6 py-3.5 rounded-2xl glass-card flex items-center justify-center opacity-80 hover:opacity-100 transition duration-300"
            >
              <span className="text-lg font-bold text-slate-200 tracking-wide">{partner.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustedBy;
