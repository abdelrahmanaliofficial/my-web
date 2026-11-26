const fs = require('fs');
let content = fs.readFileSync('src/components/Navbar.tsx', 'utf-8');

// The line: const logoUrl = currentSettings?.appearance?.logo_url || null;
// Replace with:
content = content.replace(
  "const logoUrl = currentSettings?.appearance?.logo_url || null;",
  "const defaultLogo = currentSettings?.appearance?.logo_url || null;\n  const logoDark = currentSettings?.appearance?.logo_dark_url || null;\n  // Using dark logo for navbar if provided, since it's a dark background\n  const logoUrl = logoDark || defaultLogo;"
);

// We added drop-shadow earlier, we can keep it as an extra fallback, 
// but if they upload a white logo, it's nice to have. Let's just keep the drop-shadow as we already patched it, 
// or remove the drop-shadow so the white logo looks clean without weird auras. Let's revert the drop shadow just to be safe.
content = content.replace(
  'className="h-10 md:h-12 w-auto object-contain drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]"',
  'className="h-10 md:h-12 w-auto object-contain drop-shadow-sm"'
);
content = content.replace(
  'className="h-10 md:h-12 w-auto object-contain drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]"',
  'className="h-10 md:h-12 w-auto object-contain drop-shadow-sm"'
);

fs.writeFileSync('src/components/Navbar.tsx', content);
