import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const configuredUrl = (process.env.APP_URL || '').trim();
if (!configuredUrl) {
  console.warn('[Sitemap] APP_URL is not configured. Skipping sitemap generation instead of publishing a guessed domain.');
  process.exit(0);
}

let baseUrl;
try {
  baseUrl = new URL(configuredUrl);
} catch {
  console.error('[Sitemap] APP_URL must be a valid absolute HTTP(S) URL.');
  process.exit(1);
}

if (!['http:', 'https:'].includes(baseUrl.protocol)) {
  console.error('[Sitemap] APP_URL must use HTTP or HTTPS.');
  process.exit(1);
}

const origin = baseUrl.origin.replace(/\/$/, '');
const publicRoutes = ['/', '/portfolio', '/contact'];
const urls = publicRoutes.map((route) => {
  const loc = `${origin}${route}`;
  const priority = route === '/' ? '1.0' : '0.8';
  return `  <url>
    <loc>${loc}</loc>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
}).join('\n');

const publicDir = path.join(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap, 'utf8');
console.log(`[Sitemap] Generated ${publicRoutes.length} public URLs for ${origin}.`);
