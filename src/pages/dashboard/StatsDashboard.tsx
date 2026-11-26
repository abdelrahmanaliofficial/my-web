import React, { useState } from 'react';
import { Activity, BarChart3, Database, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '../../i18n/LanguageContext';
import { useSettings } from '../../contexts/SettingsContext';
import { extractApiError } from '../../lib/apiClient';

export default function StatsDashboard() {
  const { language, dir } = useLanguage();
  const { settings, updateSettings } = useSettings();
  const [savingVisibility, setSavingVisibility] = useState(false);

  const handleVisibilityChange = async (showStats: boolean) => {
    setSavingVisibility(true);
    try {
      await updateSettings({ pages: { ...settings.pages, show_stats: showStats } });
      toast.success(language === 'ar' ? 'تم تحديث إعدادات الإحصائيات' : 'Statistics visibility updated');
    } catch (error) {
      toast.error(extractApiError(error, language === 'ar' ? 'تعذر حفظ الإعدادات' : 'Unable to save settings').message);
    } finally {
      setSavingVisibility(false);
    }
  };

  return (
    <div className="space-y-6" dir={dir}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 bg-white dark:bg-slate-900 px-4 py-3 rounded-xl shadow-sm border border-sky-100 dark:border-sky-900/30">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {dir === 'rtl' ? 'الإحصائيات' : 'Stats Section'}
            </span>
            <span className={`mt-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-bold w-fit ${settings.pages.show_stats ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
              {settings.pages.show_stats ? (dir === 'rtl' ? 'نشط' : 'Active') : (dir === 'rtl' ? 'مخفي' : 'Hidden')}
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer ml-2 rtl:ml-0 rtl:mr-2">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={settings.pages.show_stats}
              disabled={savingVisibility}
              onChange={(event) => void handleVisibilityChange(event.target.checked)}
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500 peer-disabled:opacity-50" />
          </label>
        </div>
      </div>

      <section className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
            <BarChart3 size={23} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {dir === 'rtl' ? 'مصدر بيانات الإحصائيات' : 'Analytics Data Source'}
            </h2>
            <p className="text-sm text-slate-400">
              {dir === 'rtl' ? 'لن تظهر أرقام قبل ربط مصدر بيانات موثوق.' : 'Metrics will remain hidden until a verified data source is connected.'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-200 text-sm">
              {dir === 'rtl' ? 'الإحصائيات الفعلية غير متصلة بعد' : 'Verified analytics are not connected yet'}
            </p>
            <p className="text-sm text-slate-300">
              {dir === 'rtl'
                ? 'تم إخفاء الأرقام والرسوم التجريبية حتى لا تظهر بيانات غير حقيقية. يلزم ربط أحداث الزيارات والعملاء المحتملين والحجوزات بقاعدة البيانات قبل عرض تقارير دقيقة.'
                : 'Sample numbers and charts have been removed. Connect real visit, lead and booking events to the database before displaying analytics.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 flex items-center gap-3">
            <Activity className="text-sky-400" size={20} />
            <span className="text-sm text-slate-300">{dir === 'rtl' ? 'زيارات الموقع: غير متاحة' : 'Website visits: not available'}</span>
          </div>
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 flex items-center gap-3">
            <Database className="text-sky-400" size={20} />
            <span className="text-sm text-slate-300">{dir === 'rtl' ? 'العملاء المحتملون: غير متاح' : 'Qualified leads: not available'}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
