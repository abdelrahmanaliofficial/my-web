const fs = require('fs');
let content = fs.readFileSync('src/pages/dashboard/StatsDashboard.tsx', 'utf-8');

const newToggles = `<div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-4 bg-white dark:bg-slate-900 px-4 py-3 rounded-xl shadow-sm border border-sky-100 dark:border-sky-900/30">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {dir === 'rtl' ? 'الإحصائيات' : 'Stats Section'}
              </span>
              <span className={\`text-[10px] uppercase tracking-widest font-bold mt-0.5 \${settings.pages.show_stats !== false ? 'text-emerald-500' : 'text-rose-500'}\`}>
                {settings.pages.show_stats !== false ? (dir === 'rtl' ? 'معروض' : 'Visible') : (dir === 'rtl' ? 'مخفي' : 'Hidden')}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.pages.show_stats !== false}
                onChange={(e) => {
                  updateSettings({
                    ...settings,
                    pages: { ...settings.pages, show_stats: e.target.checked }
                  });
                }}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 dark:peer-focus:ring-sky-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-sky-500 rtl:peer-checked:after:-translate-x-full"></div>
            </label>
          </div>

          <div className="flex items-center gap-4 bg-white dark:bg-slate-900 px-4 py-3 rounded-xl shadow-sm border border-sky-100 dark:border-sky-900/30">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {dir === 'rtl' ? 'الشارات' : 'Badges Section'}
              </span>
              <span className={\`text-[10px] uppercase tracking-widest font-bold mt-0.5 \${settings.pages.show_badges !== false ? 'text-emerald-500' : 'text-rose-500'}\`}>
                {settings.pages.show_badges !== false ? (dir === 'rtl' ? 'معروض' : 'Visible') : (dir === 'rtl' ? 'مخفي' : 'Hidden')}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.pages.show_badges !== false}
                onChange={(e) => {
                  updateSettings({
                    ...settings,
                    pages: { ...settings.pages, show_badges: e.target.checked }
                  });
                }}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 dark:peer-focus:ring-sky-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-sky-500 rtl:peer-checked:after:-translate-x-full"></div>
            </label>
          </div>`;

const oldTogglesRegex = /<div className="flex flex-col sm:flex-row items-center gap-4">[\s\S]*?rtl:peer-checked:after:-translate-x-full"><\/div>\s*?<\/label>\s*?<\/div>/;

content = content.replace(oldTogglesRegex, newToggles);
fs.writeFileSync('src/pages/dashboard/StatsDashboard.tsx', content);
console.log('Patched StatsDashboard.tsx badges successfully');
