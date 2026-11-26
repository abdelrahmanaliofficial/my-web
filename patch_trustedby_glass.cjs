const fs = require('fs');
let content = fs.readFileSync('src/components/TrustedBy.tsx', 'utf-8');

const targetContent = `<div className="flex flex-wrap justify-center items-center gap-12 px-6 max-w-6xl mx-auto">
        {visiblePartners.map((partner) => (
          <a
            key={partner.id}
            href={partner.url || '#'}
            target={partner.url ? "_blank" : "_self"}
            rel="noopener noreferrer"
            className={\`flex flex-col items-center justify-center opacity-60 hover:opacity-100 transition duration-300 \${partner.url ? 'cursor-pointer' : 'cursor-default'}\`}
            title={partner.name}
          >
            {partner.logo ? (
              <img src={partner.logo} alt={partner.name} className="h-12 w-auto object-contain grayscale hover:grayscale-0 transition-all duration-300" />
            ) : (
              <span className="text-xl font-bold text-slate-300 font-sans tracking-wide">{partner.name}</span>
            )}
          </a>
        ))}
      </div>`;

const replacementContent = `<div className="flex flex-wrap justify-center items-center gap-6 md:gap-8 px-6 max-w-6xl mx-auto">
        {visiblePartners.map((partner) => (
          <a
            key={partner.id}
            href={partner.url || '#'}
            target={partner.url ? "_blank" : "_self"}
            rel="noopener noreferrer"
            className={\`group flex flex-col items-center justify-center min-w-[140px] md:min-w-[180px] p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md hover:border-sky-400/50 hover:shadow-[0_0_20px_rgba(56,189,248,0.15)] hover:-translate-y-1 transition-all duration-300 \${partner.url ? 'cursor-pointer' : 'cursor-default'}\`}
            title={partner.name}
          >
            {partner.logo ? (
              <img src={partner.logo} alt={partner.name} className="h-10 md:h-12 w-auto object-contain opacity-70 group-hover:opacity-100 grayscale group-hover:grayscale-0 transition-all duration-300" />
            ) : (
              <span className="text-lg md:text-xl font-bold text-slate-400 group-hover:text-white font-sans tracking-wide transition-colors duration-300">{partner.name}</span>
            )}
          </a>
        ))}
      </div>`;

if (content.includes('gap-12')) {
  content = content.replace(targetContent, replacementContent);
  fs.writeFileSync('src/components/TrustedBy.tsx', content);
  console.log('Patched TrustedBy.tsx with glassmorphism successfully');
} else {
  console.log('Target content not found in TrustedBy.tsx');
}
