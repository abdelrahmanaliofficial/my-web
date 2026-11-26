export type ProjectStatus =
  | 'planning'
  | 'in_progress'
  | 'waiting_for_client'
  | 'under_review'
  | 'completed'
  | 'on_hold';

export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent';

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';

export interface ProjectMilestone {
  id: number;
  project_id: number;
  title: string;
  description?: string | null;
  due_date?: string | null;
  status: MilestoneStatus;
  sort_order: number;
  completed_at?: string | null;
}

export interface ProjectTask {
  id: number;
  project_id: number;
  milestone_id?: number | null;
  assigned_to?: number | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  deadline?: string | null;
  is_client_visible: boolean;
  assignee?: {
    id: number;
    name: string;
    email?: string;
  } | null;
}

export interface ProjectUpdateEntry {
  id: number;
  project_id: number;
  author_id?: number | null;
  type: 'progress_update' | 'internal_note' | 'approval_request' | 'client_decision';
  title?: string | null;
  body: string;
  is_internal: boolean;
  approval_status?: 'pending' | 'approved' | 'changes_requested' | null;
  responded_by?: number | null;
  responded_at?: string | null;
  created_at: string;
  author?: {
    id: number;
    name: string;
    email?: string;
  } | null;
  responder?: {
    id: number;
    name: string;
    email?: string;
  } | null;
}

export interface ProjectRecord {
  id: number;
  project_code: string;
  client_id: number;
  name: string;
  title?: string;
  service_category: string;
  description?: string | null;
  summary?: string | null;
  start_date?: string | null;
  expected_completion_date?: string | null;
  due_date?: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  progress_percentage: number;
  assigned_team_member_id?: number | null;
  created_at: string;
  updated_at: string;
  client?: {
    id: number;
    client_code: string;
    full_name: string;
    company_name?: string | null;
    account_status?: string;
  } | null;
  assigned_team_member?: {
    id: number;
    name: string;
    email?: string;
    role?: string;
  } | null;
  milestones?: ProjectMilestone[];
  tasks?: ProjectTask[];
  updates?: ProjectUpdateEntry[];
}

export interface CreateProjectPayload {
  client_id: number;
  name: string;
  service_category: string;
  description?: string;
  start_date?: string;
  expected_completion_date?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  progress_percentage?: number;
  assigned_team_member_id?: number | null;
}

export interface UpdateProjectPayload extends Partial<CreateProjectPayload> {}

export interface ClientProgressSummary {
  totalProjects: number;
  completedProjects: number;
  activeProjects: number;
  waitingForClientProjects: number;
  averageProgress: number;
  totalMilestones: number;
  completedMilestones: number;
  pendingApprovalsCount: number;
}

export function clampProgressPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Defensive sanitizer for client-facing project state: strips internal admin notes
 * and non-client-visible tasks even if present in a raw payload.
 */
export function sanitizeProjectForClientView(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    tasks: (project.tasks || []).filter((t) => t.is_client_visible === true),
    updates: (project.updates || []).filter(
      (u) => !u.is_internal && u.type !== 'internal_note'
    ),
  };
}

export function calculateClientOverallProgress(projects: ProjectRecord[]): ClientProgressSummary {
  if (projects.length === 0) {
    return {
      totalProjects: 0,
      completedProjects: 0,
      activeProjects: 0,
      waitingForClientProjects: 0,
      averageProgress: 0,
      totalMilestones: 0,
      completedMilestones: 0,
      pendingApprovalsCount: 0,
    };
  }

  let progressSum = 0;
  let completedProjects = 0;
  let activeProjects = 0;
  let waitingForClientProjects = 0;
  let totalMilestones = 0;
  let completedMilestones = 0;
  let pendingApprovalsCount = 0;

  for (const project of projects) {
    const clean = sanitizeProjectForClientView(project);
    progressSum += clampProgressPercentage(clean.progress_percentage);

    if (clean.status === 'completed') completedProjects += 1;
    if (clean.status === 'in_progress' || clean.status === 'under_review') activeProjects += 1;
    if (clean.status === 'waiting_for_client') waitingForClientProjects += 1;

    const milestones = clean.milestones || [];
    totalMilestones += milestones.length;
    completedMilestones += milestones.filter((m) => m.status === 'completed').length;

    const updates = clean.updates || [];
    pendingApprovalsCount += updates.filter(
      (u) => u.type === 'approval_request' && u.approval_status === 'pending'
    ).length;
  }

  return {
    totalProjects: projects.length,
    completedProjects,
    activeProjects,
    waitingForClientProjects,
    averageProgress: Math.round(progressSum / projects.length),
    totalMilestones,
    completedMilestones,
    pendingApprovalsCount,
  };
}

export function filterProjects(
  projects: ProjectRecord[],
  criteria: {
    search?: string;
    status?: 'all' | ProjectStatus;
    priority?: 'all' | ProjectPriority;
    clientId?: 'all' | number;
  }
): ProjectRecord[] {
  const term = (criteria.search || '').trim().toLowerCase();
  const status = criteria.status || 'all';
  const priority = criteria.priority || 'all';
  const clientId = criteria.clientId ?? 'all';

  return projects.filter((p) => {
    if (status !== 'all' && p.status !== status) return false;
    if (priority !== 'all' && p.priority !== priority) return false;
    if (clientId !== 'all' && p.client_id !== clientId) return false;

    if (!term) return true;
    const haystack = [
      p.project_code,
      p.name,
      p.service_category,
      p.client?.full_name || '',
      p.client?.company_name || '',
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(term);
  });
}
