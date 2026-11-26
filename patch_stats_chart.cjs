const fs = require('fs');
let content = fs.readFileSync('src/pages/dashboard/StatsDashboard.tsx', 'utf-8');

if (!content.includes('AreaChart')) {
  content = content.replace(
    "import { Plus, Edit2, Trash2, Save, X, Activity } from 'lucide-react';",
    "import { Plus, Edit2, Trash2, Save, X, Activity, TrendingUp } from 'lucide-react';\nimport { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';"
  );
  
  const chartDataCode = `
const mockChartData = [
  { name: 'Jan', growth: 1200 },
  { name: 'Feb', growth: 1900 },
  { name: 'Mar', growth: 2400 },
  { name: 'Apr', growth: 2800 },
  { name: 'May', growth: 3500 },
  { name: 'Jun', growth: 4200 },
  { name: 'Jul', growth: 4800 },
];
`;

  content = content.replace('export default function StatsDashboard() {', chartDataCode + '\nexport default function StatsDashboard() {');

  const chartUI = `
      <div className="bg-slate-50 dark:bg-slate-900/60 p-6 rounded-3xl shadow-sm border border-sky-500/30 dark:border-slate-800 mb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <TrendingUp size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {dir === 'rtl' ? 'نمو الإحصائيات' : 'Growth Overview'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {dir === 'rtl' ? 'معدل نمو التفاعلات خلال الأشهر الأخيرة' : 'Interaction growth over recent months'}
            </p>
          </div>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#f8fafc' }}
                itemStyle={{ color: '#38bdf8' }}
              />
              <Area type="monotone" dataKey="growth" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorGrowth)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <AnimatePresence>`;

  content = content.replace('<AnimatePresence>', chartUI);
  fs.writeFileSync('src/pages/dashboard/StatsDashboard.tsx', content);
  console.log('Patched StatsDashboard.tsx with Recharts');
} else {
  console.log('Already patched with Recharts');
}
