import React from 'react';
import { FolderKanban, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { ProjectRecord, calculateClientOverallProgress } from '../../types/project';

interface ClientOverallProgressProps {
  projects: ProjectRecord[];
}

const ClientOverallProgress: React.FC<ClientOverallProgressProps> = ({ projects }) => {
  const { language, dir } = useLanguage();
  const summary = calculateClientOverallProgress(projects);

  const milestonePercent =
    summary.totalMilestones > 0
      ? Math.round((summary.completedMilestones / summary.totalMilestones) * 100)
      : 0;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-5" dir={dir}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white">
            {language === 'ar' ? 'التقدم العام للمشاريع' : 'Overall Project Progress'}
          </h3>
          <p className="text-xs text-slate-400">
            {language === 'ar'
              ? 'ملخص مباشر لحالة مشاريعك والمراحل المعتمدة'
              : 'Live completion metrics across your assigned projects and milestones.'}
          </p>
        </div>

        <span className="text-2xl font-black text-sky-400">{summary.averageProgress}%</span>
      </div>

      <div className="w-full h-3 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-300"
          style={{ width: `${summary.averageProgress}%` }}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <FolderKanban className="w-3.5 h-3.5 text-sky-400" />
            <span>{language === 'ar' ? 'إجمالي المشاريع' : 'Total Projects'}</span>
          </div>
          <span className="text-lg font-black text-white">{summary.totalProjects}</span>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>{language === 'ar' ? 'قيد التنفيذ' : 'Active'}</span>
          </div>
          <span className="text-lg font-black text-white">{summary.activeProjects}</span>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{language === 'ar' ? 'المراحل المنجزة' : 'Milestones'}</span>
          </div>
          <span className="text-lg font-black text-white">
            {summary.completedMilestones}/{summary.totalMilestones} ({milestonePercent}%)
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>{language === 'ar' ? 'بانتظار موافقتك' : 'Pending Approvals'}</span>
          </div>
          <span className="text-lg font-black text-white">{summary.pendingApprovalsCount}</span>
        </div>
      </div>
    </div>
  );
};

export default ClientOverallProgress;
