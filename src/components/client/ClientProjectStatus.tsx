import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Calendar,
  CheckCircle2,
  Clock,
  MessageSquare,
  ThumbsUp,
  RotateCcw,
  UserCheck,
  ListChecks,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { extractApiError } from '../../lib/apiClient';
import {
  ProjectRecord,
  ProjectStatus,
  sanitizeProjectForClientView,
} from '../../types/project';
import ClientProjectFiles from './ClientProjectFiles';

interface ClientProjectStatusProps {
  projects: ProjectRecord[];
  onRespondToApproval: (
    projectId: number,
    updateId: number,
    decision: 'approved' | 'changes_requested',
    comment?: string
  ) => Promise<ProjectRecord>;
}

const statusBadges: Record<ProjectStatus, string> = {
  planning: 'bg-slate-800 text-slate-300 border-slate-700',
  in_progress: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  waiting_for_client: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  under_review: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
  completed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  on_hold: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

const ClientProjectStatus: React.FC<ClientProjectStatusProps> = ({
  projects,
  onRespondToApproval,
}) => {
  const { language, dir } = useLanguage();
  const [comments, setComments] = useState<Record<number, string>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const handleDecision = async (
    projectId: number,
    updateId: number,
    decision: 'approved' | 'changes_requested'
  ) => {
    setSubmittingId(updateId);
    try {
      await onRespondToApproval(projectId, updateId, decision, comments[updateId]?.trim() || '');
      setComments((prev) => ({ ...prev, [updateId]: '' }));
      toast.success(
        decision === 'approved'
          ? language === 'ar'
            ? 'تم تسجيل موافقتك بنجاح'
            : 'Approval recorded'
          : language === 'ar'
          ? 'تم إرسال طلب التعديلات'
          : 'Revision request sent'
      );
    } catch (err) {
      const info = extractApiError(err, 'Failed to submit decision.');
      toast.error(info.message);
    } finally {
      setSubmittingId(null);
    }
  };

  if (projects.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-sm text-slate-500">
        {language === 'ar' ? 'لا توجد مشاريع نشطة حالياً.' : 'No assigned projects yet.'}
      </div>
    );
  }

  return (
    <div className="space-y-6" dir={dir}>
      {projects.map((rawProject) => {
        const project = sanitizeProjectForClientView(rawProject);
        const milestones = project.milestones || [];
        const visibleTasks = project.tasks || [];
        const visibleUpdates = project.updates || [];

        return (
          <article
            key={project.id}
            className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold text-white">{project.name}</h3>
                  <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 text-xs font-mono">
                    {project.project_code}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${
                      statusBadges[project.status] || statusBadges.planning
                    }`}
                  >
                    {project.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {project.service_category}
                  {project.assigned_team_member
                    ? ` • ${language === 'ar' ? 'المسؤول:' : 'Lead:'} ${project.assigned_team_member.name}`
                    : ''}
                </p>
                {project.description && (
                  <p className="text-sm text-slate-300 mt-2">{project.description}</p>
                )}
              </div>

              <div className="text-end shrink-0">
                <span className="text-2xl font-black text-sky-400">
                  {project.progress_percentage}%
                </span>
                {(project.start_date || project.expected_completion_date) && (
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 justify-end mt-1">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {project.start_date || '—'} → {project.expected_completion_date || '—'}
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="w-full h-2.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-300"
                style={{ width: `${project.progress_percentage}%` }}
              />
            </div>

            {/* Milestones */}
            {milestones.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {language === 'ar' ? 'مراحل التنفيذ' : 'Milestones'}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {milestones.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {m.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <div>
                          <p className="font-bold text-white">{m.title}</p>
                          {m.due_date && (
                            <span className="text-slate-500">{m.due_date}</span>
                          )}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300">
                        {m.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Client-Visible Tasks & Deadlines */}
            {visibleTasks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'المهام والمواعيد' : 'Tasks & Deadlines'}</span>
                </h4>
                <div className="space-y-2">
                  {visibleTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-white">{task.title}</p>
                        {task.assignee && (
                          <span className="text-slate-500 inline-flex items-center gap-1 mt-0.5">
                            <UserCheck className="w-3 h-3" />
                            {task.assignee.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {task.deadline && (
                          <span className="text-slate-400">{task.deadline}</span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 font-semibold">
                          {task.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Client-Visible Updates & Approvals */}
            {visibleUpdates.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'تحديثات المشروع والموافقات' : 'Updates & Approvals'}</span>
                </h4>
                <div className="space-y-3">
                  {visibleUpdates.map((update) => {
                    const isPendingApproval =
                      update.type === 'approval_request' && update.approval_status === 'pending';

                    return (
                      <div
                        key={update.id}
                        className={`p-4 rounded-xl border text-xs space-y-2.5 ${
                          isPendingApproval
                            ? 'bg-amber-500/5 border-amber-500/30'
                            : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-white">
                            {update.title || update.type.replace(/_/g, ' ')}
                          </span>
                          <div className="flex items-center gap-2">
                            {update.approval_status && (
                              <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 font-bold">
                                {update.approval_status.replace(/_/g, ' ')}
                              </span>
                            )}
                            <span className="text-slate-500">
                              {new Date(update.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <p className="text-slate-300 leading-relaxed">{update.body}</p>

                        {isPendingApproval && (
                          <div className="pt-2 border-t border-amber-500/20 space-y-2">
                            <input
                              type="text"
                              value={comments[update.id] || ''}
                              onChange={(e) =>
                                setComments((prev) => ({ ...prev, [update.id]: e.target.value }))
                              }
                              placeholder={
                                language === 'ar'
                                  ? 'ملاحظات اختيارية قبل الإرسال...'
                                  : 'Optional feedback or revision notes...'
                              }
                              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={submittingId === update.id}
                                onClick={() => handleDecision(project.id, update.id, 'approved')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold cursor-pointer"
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                                <span>{language === 'ar' ? 'موافقة' : 'Approve'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={submittingId === update.id}
                                onClick={() =>
                                  handleDecision(project.id, update.id, 'changes_requested')
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-60 text-amber-200 font-bold cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>
                                  {language === 'ar' ? 'طلب تعديلات' : 'Request Revisions'}
                                </span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <ClientProjectFiles projectId={project.id} projectName={project.name} />
          </article>
        );
      })}
    </div>
  );
};

export default ClientProjectStatus;
