import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  FolderPlus,
  Search,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Lock,
  Globe,
  CheckCircle2,
  Send,
  AlertCircle,
  X,
  ThumbsUp,
  RotateCcw,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useProjects } from '../../contexts/ProjectsContext';
import { apiClient, extractApiError } from '../../lib/apiClient';
import { ClientRecord } from '../../types/client';
import { TeamMemberRecord, sanitizeUserPayload } from '../../types/auth';
import {
  MilestoneStatus,
  ProjectPriority,
  ProjectRecord,
  ProjectStatus,
  TaskStatus,
  clampProgressPercentage,
  filterProjects,
} from '../../types/project';
import AdminProjectFiles from '../../components/dashboard/AdminProjectFiles';

const PROJECT_STATUSES: ProjectStatus[] = [
  'planning',
  'in_progress',
  'waiting_for_client',
  'under_review',
  'completed',
  'on_hold',
];

const PROJECT_PRIORITIES: ProjectPriority[] = ['low', 'medium', 'high', 'urgent'];

const ProjectsPage: React.FC = () => {
  const { language, dir } = useLanguage();
  const { hasPermission } = useAuth();
  const {
    projects,
    loading,
    error,
    createProject,
    updateProject,
    updateProjectStatus,
    deleteProject,
    createMilestone,
    updateMilestone,
    reorderMilestones,
    deleteMilestone,
    createTask,
    updateTask,
    deleteTask,
    addProjectUpdate,
    respondToApproval,
  } = useProjects();

  const canCreateProjects = hasPermission('create_projects') || hasPermission('manage_projects');
  const canUpdateProjects = hasPermission('update_projects') || hasPermission('manage_projects');
  const canDeleteProjects = hasPermission('delete_projects') || hasPermission('manage_projects');

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRecord[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | ProjectPriority>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<
    'overview' | 'milestones' | 'tasks' | 'updates' | 'files'
  >('overview');
  const [busy, setBusy] = useState(false);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [formClientId, setFormClientId] = useState<string>('');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Web Engineering');
  const [formDescription, setFormDescription] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formStatus, setFormStatus] = useState<ProjectStatus>('planning');
  const [formPriority, setFormPriority] = useState<ProjectPriority>('medium');
  const [formProgress, setFormProgress] = useState(0);
  const [formAssigneeId, setFormAssigneeId] = useState<string>('');

  // Edit overview fields for selected project
  const [editName, setEditName] = useState('');
  const [editClientId, setEditClientId] = useState<string>('');
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editStatus, setEditStatus] = useState<ProjectStatus>('planning');
  const [editPriority, setEditPriority] = useState<ProjectPriority>('medium');
  const [editProgress, setEditProgress] = useState(0);
  const [editAssigneeId, setEditAssigneeId] = useState<string>('');

  // Milestones / Tasks / Updates inputs
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDue, setMilestoneDue] = useState('');

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState<string>('');
  const [taskClientVisible, setTaskClientVisible] = useState(true);

  const [updateTitle, setUpdateTitle] = useState('');
  const [updateBody, setUpdateBody] = useState('');
  const [updateMode, setUpdateMode] = useState<'public' | 'internal' | 'approval'>('public');

  useEffect(() => {
    let active = true;

    // This endpoint is scoped to project assignment and returns only minimal
    // active client/staff fields, so project managers do not need broad Clients
    // or Team listing permissions just to assign a project.
    if (!canCreateProjects && !canUpdateProjects) {
      setClients([]);
      setTeamMembers([]);
      return () => {
        active = false;
      };
    }

    apiClient
      .get('/api/projects/assignment-options')
      .then((response) => {
        if (!active) return;
        const options = response.data?.data || {};
        setClients(Array.isArray(options.clients) ? options.clients : []);
        setTeamMembers(
          (Array.isArray(options.team_members) ? options.team_members : [])
            .map((member: unknown) => sanitizeUserPayload(member))
            .filter((member: TeamMemberRecord | null): member is TeamMemberRecord => member !== null)
        );
      })
      .catch((err) => {
        if (!active) return;
        const info = extractApiError(err, 'Unable to load project assignment options.');
        toast.error(info.message);
      });

    return () => {
      active = false;
    };
  }, [canCreateProjects, canUpdateProjects]);

  const selectedProject: ProjectRecord | null =
    projects.find((p) => p.id === selectedId) || null;

  useEffect(() => {
    if (!selectedProject) return;
    setEditName(selectedProject.name || '');
    setEditClientId(String(selectedProject.client_id || ''));
    setEditCategory(selectedProject.service_category || '');
    setEditDescription(selectedProject.description || '');
    setEditStartDate(selectedProject.start_date || '');
    setEditEndDate(selectedProject.expected_completion_date || '');
    setEditStatus(selectedProject.status);
    setEditPriority(selectedProject.priority);
    setEditProgress(selectedProject.progress_percentage);
    setEditAssigneeId(
      selectedProject.assigned_team_member_id
        ? String(selectedProject.assigned_team_member_id)
        : ''
    );
  }, [selectedProject]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateProjects || !formClientId) return;
    setBusy(true);
    try {
      const created = await createProject({
        client_id: Number(formClientId),
        name: formName.trim(),
        service_category: formCategory.trim(),
        description: formDescription.trim() || undefined,
        start_date: formStartDate || undefined,
        expected_completion_date: formEndDate || undefined,
        status: formStatus,
        priority: formPriority,
        progress_percentage: clampProgressPercentage(formProgress),
        assigned_team_member_id: formAssigneeId ? Number(formAssigneeId) : null,
      });
      setCreateOpen(false);
      setFormName('');
      setFormDescription('');
      setFormProgress(0);
      setSelectedId(created.id);
      toast.success(language === 'ar' ? 'تم إنشاء المشروع بنجاح' : 'Project created');
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to create project.').message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !canUpdateProjects) return;
    setBusy(true);
    try {
      await updateProject(selectedProject.id, {
        client_id: editClientId ? Number(editClientId) : selectedProject.client_id,
        name: editName.trim(),
        service_category: editCategory.trim(),
        description: editDescription.trim(),
        start_date: editStartDate || undefined,
        expected_completion_date: editEndDate || undefined,
        status: editStatus,
        priority: editPriority,
        progress_percentage: clampProgressPercentage(editProgress),
        assigned_team_member_id: editAssigneeId ? Number(editAssigneeId) : null,
      });
      toast.success(language === 'ar' ? 'تم تحديث بيانات المشروع' : 'Project updated');
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to update project.').message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !canUpdateProjects || !milestoneTitle.trim()) return;
    setBusy(true);
    try {
      await createMilestone(selectedProject.id, {
        title: milestoneTitle.trim(),
        due_date: milestoneDue || undefined,
      });
      setMilestoneTitle('');
      setMilestoneDue('');
      toast.success(language === 'ar' ? 'تمت إضافة المرحلة' : 'Milestone added');
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to add milestone.').message);
    } finally {
      setBusy(false);
    }
  };

  const handleMoveMilestone = async (index: number, direction: -1 | 1) => {
    if (!selectedProject || !canUpdateProjects) return;
    const list = [...(selectedProject.milestones || [])];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item);
    try {
      await reorderMilestones(
        selectedProject.id,
        list.map((m) => m.id)
      );
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to reorder milestones.').message);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !canUpdateProjects || !taskTitle.trim()) return;
    setBusy(true);
    try {
      await createTask(selectedProject.id, {
        title: taskTitle.trim(),
        deadline: taskDeadline || undefined,
        assigned_to: taskAssigneeId ? Number(taskAssigneeId) : null,
        is_client_visible: taskClientVisible,
      });
      setTaskTitle('');
      setTaskDeadline('');
      toast.success(language === 'ar' ? 'تمت إضافة المهمة' : 'Task created');
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to add task.').message);
    } finally {
      setBusy(false);
    }
  };

  const handlePostUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !canUpdateProjects || !updateBody.trim()) return;
    setBusy(true);
    try {
      await addProjectUpdate(selectedProject.id, {
        title: updateTitle.trim() || undefined,
        body: updateBody.trim(),
        is_internal: updateMode === 'internal',
        request_approval: updateMode === 'approval',
      });
      setUpdateTitle('');
      setUpdateBody('');
      toast.success(
        updateMode === 'internal'
          ? language === 'ar'
            ? 'تم حفظ الملاحظة الداخلية'
            : 'Internal note saved'
          : updateMode === 'approval'
          ? language === 'ar'
            ? 'تم إرسال طلب موافقة العميل'
            : 'Client approval requested'
          : language === 'ar'
          ? 'تم نشر تحديث المشروع'
          : 'Progress update posted'
      );
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to post update.').message);
    } finally {
      setBusy(false);
    }
  };

  const visibleProjects = filterProjects(projects, {
    search,
    status: statusFilter,
    priority: priorityFilter,
  });

  return (
    <div className="space-y-6" dir={dir}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">
            {language === 'ar' ? 'إدارة وتتبع المشاريع' : 'Project Tracking System'}
          </h2>
          <p className="text-xs text-slate-400">
            {language === 'ar'
              ? 'إدارة المشاريع، المراحل، المهام، التحديثات، الملاحظات الداخلية، وموافقات العملاء'
              : 'Manage projects, milestones, deadlines, tasks, private internal notes, and client approvals.'}
          </p>
        </div>

        {canCreateProjects && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm cursor-pointer w-fit"
          >
            <FolderPlus className="w-4 h-4" />
            <span>{language === 'ar' ? 'مشروع جديد' : 'New Project'}</span>
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              language === 'ar'
                ? 'بحث بالاسم، الكود، التصنيف، أو العميل...'
                : 'Search project name, code, category, or client...'
            }
            className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-10 pe-3.5 py-2.5 text-sm text-white"
          />
        </div>

        <select
          aria-label="Filter by project status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | ProjectStatus)}
          className="rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
        >
          <option value="all">{language === 'ar' ? 'جميع الحالات' : 'All Statuses'}</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by project priority"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as 'all' | ProjectPriority)}
          className="rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
        >
          <option value="all">{language === 'ar' ? 'جميع الأولويات' : 'All Priorities'}</option>
          {PROJECT_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Project List */}
        <div className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-6 text-sm text-slate-400">Loading projects...</div>
          ) : visibleProjects.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {language === 'ar' ? 'لا توجد مشاريع.' : 'No projects found.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {visibleProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedId(project.id)}
                  className={`w-full text-start p-4 transition-colors cursor-pointer space-y-2 ${
                    selectedId === project.id ? 'bg-sky-500/10' : 'hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-white text-sm block">{project.name}</span>
                      <span className="text-[11px] font-mono text-sky-400">
                        {project.project_code}
                      </span>
                      {project.client && (
                        <span className="text-xs text-slate-400 block mt-0.5">
                          {project.client.full_name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-sky-300">
                      {project.progress_percentage}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{project.status.replace(/_/g, ' ')}</span>
                    <span className="uppercase">{project.priority}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Project Workspace */}
        <div className="lg:col-span-8 bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          {!selectedProject ? (
            <div className="h-full min-h-[300px] flex items-center justify-center text-sm text-slate-500">
              {language === 'ar'
                ? 'اختر مشروعاً لعرض وإدارة المراحل والمهام والتحديثات'
                : 'Select a project to manage milestones, tasks, updates, and client approvals.'}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-white">{selectedProject.name}</h3>
                    <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 font-mono text-xs">
                      {selectedProject.project_code}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {selectedProject.service_category} • {selectedProject.client?.full_name || '—'}
                  </p>
                </div>

                {canDeleteProjects && (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteProject(selectedProject.id);
                      setSelectedId(null);
                      toast.success('Project deleted');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-xs font-bold cursor-pointer w-fit"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'حذف' : 'Delete'}</span>
                  </button>
                )}
              </div>

              {/* Workspace Tabs */}
              <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
                {(['overview', 'milestones', 'tasks', 'updates', 'files'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDetailTab(tab)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize cursor-pointer ${
                      detailTab === tab
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {detailTab === 'overview' && (
                <form onSubmit={handleSaveOverview} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Project Name
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!canUpdateProjects}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Client
                      </label>
                      <select
                        disabled={!canUpdateProjects}
                        value={editClientId}
                        onChange={(e) => setEditClientId(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60"
                      >
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.full_name} ({c.client_code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Service Category
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!canUpdateProjects}
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Assigned Team Member
                      </label>
                      <select
                        disabled={!canUpdateProjects}
                        value={editAssigneeId}
                        onChange={(e) => setEditAssigneeId(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Status
                      </label>
                      <select
                        disabled={!canUpdateProjects}
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as ProjectStatus)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60"
                      >
                        {PROJECT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Priority
                      </label>
                      <select
                        disabled={!canUpdateProjects}
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as ProjectPriority)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60"
                      >
                        {PROJECT_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        disabled={!canUpdateProjects}
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Expected Completion Date
                      </label>
                      <input
                        type="date"
                        disabled={!canUpdateProjects}
                        value={editEndDate}
                        onChange={(e) => setEditEndDate(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                      <span>Progress Percentage</span>
                      <span className="text-sky-400 font-bold">{editProgress}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      disabled={!canUpdateProjects}
                      value={editProgress}
                      onChange={(e) => setEditProgress(Number(e.target.value))}
                      className="w-full accent-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      disabled={!canUpdateProjects}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60"
                    />
                  </div>

                  {canUpdateProjects && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm cursor-pointer"
                      >
                        Save Project Changes
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          updateProjectStatus(selectedProject.id, 'completed', 100)
                        }
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-xs cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Mark Completed (100%)</span>
                      </button>
                    </div>
                  )}
                </form>
              )}

              {detailTab === 'milestones' && (
                <div className="space-y-4">
                  {canUpdateProjects && (
                    <form onSubmit={handleAddMilestone} className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        required
                        value={milestoneTitle}
                        onChange={(e) => setMilestoneTitle(e.target.value)}
                        placeholder="Milestone title"
                        className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                      />
                      <input
                        type="date"
                        value={milestoneDue}
                        onChange={(e) => setMilestoneDue(e.target.value)}
                        className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add</span>
                      </button>
                    </form>
                  )}

                  <div className="space-y-2">
                    {(selectedProject.milestones || []).map((m, idx) => (
                      <div
                        key={m.id}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="font-bold text-white">{m.title}</p>
                          <span className="text-slate-500">Order #{idx + 1} • {m.due_date || 'No due date'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            disabled={!canUpdateProjects}
                            value={m.status}
                            onChange={(e) =>
                              updateMilestone(selectedProject.id, m.id, {
                                status: e.target.value as MilestoneStatus,
                              })
                            }
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white"
                          >
                            <option value="pending">pending</option>
                            <option value="in_progress">in_progress</option>
                            <option value="completed">completed</option>
                          </select>
                          {canUpdateProjects && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleMoveMilestone(idx, -1)}
                                className="p-1.5 rounded bg-slate-900 text-slate-300 hover:text-white cursor-pointer"
                                title="Move up"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveMilestone(idx, 1)}
                                className="p-1.5 rounded bg-slate-900 text-slate-300 hover:text-white cursor-pointer"
                                title="Move down"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteMilestone(selectedProject.id, m.id)}
                                className="p-1.5 rounded bg-rose-500/10 text-rose-400 cursor-pointer"
                                title="Delete milestone"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailTab === 'tasks' && (
                <div className="space-y-4">
                  {canUpdateProjects && (
                    <form onSubmit={handleAddTask} className="space-y-3 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          required
                          value={taskTitle}
                          onChange={(e) => setTaskTitle(e.target.value)}
                          placeholder="Task title"
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-white"
                        />
                        <input
                          type="date"
                          value={taskDeadline}
                          onChange={(e) => setTaskDeadline(e.target.value)}
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-white"
                        />
                        <select
                          value={taskAssigneeId}
                          onChange={(e) => setTaskAssigneeId(e.target.value)}
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-white"
                        >
                          <option value="">Assignee (optional)</option>
                          {teamMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={taskClientVisible}
                            onChange={(e) => setTaskClientVisible(e.target.checked)}
                          />
                          <span>Client visible</span>
                        </label>
                        <button
                          type="submit"
                          disabled={busy}
                          className="px-4 py-1.5 rounded-lg bg-sky-500 text-slate-950 font-bold text-xs cursor-pointer"
                        >
                          Add Task
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-2">
                    {(selectedProject.tasks || []).map((task) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{task.title}</span>
                            <span
                              className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                                task.is_client_visible
                                  ? 'bg-sky-500/10 text-sky-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {task.is_client_visible ? 'client-visible' : 'internal'}
                            </span>
                          </div>
                          <span className="text-slate-500">
                            {task.deadline || 'No deadline'} • {task.assignee?.name || 'Unassigned'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            disabled={!canUpdateProjects}
                            value={task.status}
                            onChange={(e) =>
                              updateTask(selectedProject.id, task.id, {
                                status: e.target.value as TaskStatus,
                              })
                            }
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white"
                          >
                            <option value="todo">todo</option>
                            <option value="in_progress">in_progress</option>
                            <option value="review">review</option>
                            <option value="done">done</option>
                          </select>
                          {canUpdateProjects && (
                            <button
                              type="button"
                              onClick={() => deleteTask(selectedProject.id, task.id)}
                              className="p-1.5 rounded bg-rose-500/10 text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailTab === 'updates' && (
                <div className="space-y-4">
                  {canUpdateProjects && (
                    <form onSubmit={handlePostUpdate} className="space-y-3 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setUpdateMode('public')}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                            updateMode === 'public'
                              ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>Client Progress Update</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setUpdateMode('internal')}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                            updateMode === 'internal'
                              ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Private Internal Note</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setUpdateMode('approval')}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                            updateMode === 'approval'
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Request Client Approval</span>
                        </button>
                      </div>

                      <input
                        type="text"
                        value={updateTitle}
                        onChange={(e) => setUpdateTitle(e.target.value)}
                        placeholder="Title (optional)"
                        className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-white"
                      />
                      <textarea
                        rows={3}
                        required
                        value={updateBody}
                        onChange={(e) => setUpdateBody(e.target.value)}
                        placeholder={
                          updateMode === 'internal'
                            ? 'Private internal admin note (never visible to client)...'
                            : 'Write update or deliverable summary...'
                        }
                        className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-white"
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs cursor-pointer"
                      >
                        Post Entry
                      </button>
                    </form>
                  )}

                  <div className="space-y-3">
                    {(selectedProject.updates || []).map((entry) => (
                      <div
                        key={entry.id}
                        className={`p-4 rounded-xl border text-xs space-y-2 ${
                          entry.is_internal
                            ? 'bg-rose-500/5 border-rose-500/30'
                            : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">
                              {entry.title || entry.type.replace(/_/g, ' ')}
                            </span>
                            {entry.is_internal && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                                <Lock className="w-3 h-3" />
                                Internal Only
                              </span>
                            )}
                            {entry.approval_status && (
                              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-bold">
                                {entry.approval_status}
                              </span>
                            )}
                          </div>
                          <span className="text-slate-500">
                            {new Date(entry.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-slate-300">{entry.body}</p>

                        {canUpdateProjects &&
                          entry.type === 'approval_request' &&
                          entry.approval_status === 'pending' && (
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  respondToApproval(selectedProject.id, entry.id, 'approved')
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-bold cursor-pointer"
                              >
                                <ThumbsUp className="w-3 h-3" />
                                <span>Record Approval</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  respondToApproval(
                                    selectedProject.id,
                                    entry.id,
                                    'changes_requested'
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 font-bold cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Record Revision Request</span>
                              </button>
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailTab === 'files' && (
                <AdminProjectFiles
                  project={selectedProject}
                  canUpload={canUpdateProjects}
                  canReplace={canUpdateProjects}
                  canDelete={canDeleteProjects}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Project Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCreateOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="absolute top-4 end-4 p-2 rounded-full bg-slate-800 text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white">Create Project</h3>

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Client *
                </label>
                <select
                  required
                  value={formClientId}
                  onChange={(e) => setFormClientId(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value="">Select client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.client_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Service Category *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as ProjectStatus)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                  >
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as ProjectPriority)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                  >
                    {PROJECT_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Expected Completion Date
                  </label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Assigned Team Member
                </label>
                <select
                  value={formAssigneeId}
                  onChange={(e) => setFormAssigneeId(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Progress ({formProgress}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={formProgress}
                  onChange={(e) => setFormProgress(Number(e.target.value))}
                  className="w-full accent-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm cursor-pointer"
              >
                Create Project
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
