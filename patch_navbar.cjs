const fs = require('fs');
let content = fs.readFileSync('src/components/Navbar.tsx', 'utf-8');

content = content.replace(
  'className="h-10 md:h-12 w-auto object-contain"',
  'className="h-10 md:h-12 w-auto object-contain drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]"'
);
content = content.replace(
  'className="h-10 md:h-12 w-auto object-contain"', // replace second occurrence
  'className="h-10 md:h-12 w-auto object-contain drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]"'
);

fs.writeFileSync('src/components/Navbar.tsx', content);
