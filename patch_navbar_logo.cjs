const fs = require('fs');
let content = fs.readFileSync('src/components/Navbar.tsx', 'utf-8');

// Add import
if (!content.includes('import Logo')) {
  content = content.replace("import { useSettings } from '../contexts/SettingsContext';", "import { useSettings } from '../contexts/SettingsContext';\nimport Logo from './Logo';");
}

// Update renderBrand function
const renderBrandRegex = /const renderBrand = \(\) => \{[\s\S]*?return \([\s\S]*?\);\n  \};/;
const newRenderBrand = `const renderBrand = () => {
    if (logoDisplay === 'hidden' ) {
      return null;
    }
    
    // If no logo provided OR text_only, fallback to our custom SVG Logo
    if (!logoUrl) {
      if (logoDisplay === 'text_only') {
        return <span className="font-bold text-xl text-white tracking-tight">{defaultText}</span>;
      }
      if (logoDisplay === 'logo_only') {
        return <Logo showText={false} />;
      }
      return <Logo />;
    }

    if (logoDisplay === 'text_only') {
      return <span className="font-bold text-xl text-white tracking-tight">{defaultText}</span>;
    }
    
    if (logoDisplay === 'logo_only') {
      return (
        <img 
          src={logoUrl} 
          alt="Brand Logo" 
          className="h-10 md:h-12 w-auto object-contain drop-shadow-sm" 
        />
      );
    }
    return (
      <>
        <img 
          src={logoUrl} 
          alt="Brand Logo" 
          className="h-10 md:h-12 w-auto object-contain drop-shadow-sm" 
        />
        <span className="font-bold text-xl text-white tracking-tight hidden sm:block">
          {defaultText}
        </span>
      </>
    );
  };`;

content = content.replace(renderBrandRegex, newRenderBrand);

fs.writeFileSync('src/components/Navbar.tsx', content);
