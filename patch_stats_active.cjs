const fs = require('fs');
let content = fs.readFileSync('src/pages/dashboard/StatsDashboard.tsx', 'utf-8');

const newToggles = `<div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-4 bg-white dark:bg-slate-900 px-4 py-3 rounded-xl shadow-sm border border-sky-100 dark:border-sky-900/30">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {dir === 'rtl' ? 'الإحصائيات' : 'Stats Section'}
              </span>
              <div className="mt-1 flex items-center">
                <span className={\`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-bold \${settings.pages.show_stats !== false ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'}\`}>
                  {settings.pages.show_stats !== false ? (dir === 'rtl' ? 'نشط' : 'Active') : (dir === 'rtl' ? 'مخفي' : 'Hidden')}
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-2 rtl:ml-0 rtl:mr-2">
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
              <div className="mt-1 flex items-center">
                <span className={\`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-bold \${settings.pages.show_badges !== false ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'}\`}>
                  {settings.pages.show_badges !== false ? (dir === 'rtl' ? 'نشط' : 'Active') : (dir === 'rtl' ? 'مخفي' : 'Hidden')}
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-2 rtl:ml-0 rtl:mr-2">
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
console.log('Patched StatsDashboard.tsx active status successfully');
