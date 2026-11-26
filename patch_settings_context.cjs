const fs = require('fs');
let content = fs.readFileSync('src/contexts/SettingsContext.tsx', 'utf-8');

content = content.replace(
  "logo_url: string;",
  "logo_url: string;\n    logo_dark_url?: string;"
);

content = content.replace(
  "logo_url: '',",
  "logo_url: '',\n    logo_dark_url: '',"
);

fs.writeFileSync('src/contexts/SettingsContext.tsx', content);
