const fs = require('fs');
let content = fs.readFileSync('src/components/Footer.tsx', 'utf-8');

content = content.replace(
  "const logoUrl = currentSettings?.appearance?.logo_url || null;",
  "const defaultLogo = currentSettings?.appearance?.logo_url || null;\n  const logoDark = currentSettings?.appearance?.logo_dark_url || null;\n  // Using dark logo since footer is dark\n  const logoUrl = logoDark || defaultLogo;"
);

fs.writeFileSync('src/components/Footer.tsx', content);
