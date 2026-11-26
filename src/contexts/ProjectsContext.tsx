import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, extractApiError } from '../lib/apiClient';
import { mediaService } from '../services/mediaService';
import { MediaFileMetadata, ProjectFileCategory } from '../types/media';
import { useAuth } from './AuthContext';
import {
  CreateProjectPayload,
  MilestoneStatus,
  ProjectRecord,
  ProjectStatus,
  TaskStatus,
  UpdateProjectPayload,
  clampProgressPercentage,
  sanitizeProjectForClientView,
} from '../types/project';

export interface ProjectsContextValue {
  projects: ProjectRecord[];
  loading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  createProject: (payload: CreateProjectPayload) => Promise<ProjectRecord>;
  updateProject: (projectId: number, payload: UpdateProjectPayload) => Promise<ProjectRecord>;
  updateProjectStatus: (
    projectId: number,
    status: ProjectStatus,
    progress_percentage?: number
  ) => Promise<ProjectRecord>;
  deleteProject: (projectId: number) => Promise<void>;
  createMilestone: (
    projectId: number,
    payload: { title: string; description?: string; due_date?: string; status?: MilestoneStatus }
  ) => Promise<ProjectRecord>;
  updateMilestone: (
    projectId: number,
    milestoneId: number,
    payload: { title?: string; description?: string; due_date?: string; status?: MilestoneStatus }
  ) => Promise<ProjectRecord>;
  reorderMilestones: (projectId: number, milestoneIds: number[]) => Promise<ProjectRecord>;
  deleteMilestone: (projectId: number, milestoneId: number) => Promise<ProjectRecord>;
  createTask: (
    projectId: number,
    payload: {
      title: string;
      description?: string;
      milestone_id?: number | null;
      assigned_to?: number | null;
      status?: TaskStatus;
      deadline?: string;
      is_client_visible?: boolean;
    }
  ) => Promise<ProjectRecord>;
  updateTask: (
    projectId: number,
    taskId: number,
    payload: {
      title?: string;
      description?: string;
      status?: TaskStatus;
      deadline?: string | null;
      assigned_to?: number | null;
      is_client_visible?: boolean;
    }
  ) => Promise<ProjectRecord>;
  deleteTask: (projectId: number, taskId: number) => Promise<ProjectRecord>;
  addProjectUpdate: (
    projectId: number,
    payload: {
      title?: string;
      body: string;
      is_internal?: boolean;
      request_approval?: boolean;
    }
  ) => Promise<ProjectRecord>;
  respondToApproval: (
    projectId: number,
    updateId: number,
    decision: 'approved' | 'changes_requested',
    comment?: string
  ) => Promise<ProjectRecord>;
  projectFiles: Record<number, MediaFileMetadata[]>;
  filesLoading: Record<number, boolean>;
  filesError: Record<number, string | null>;
  fetchProjectFiles: (projectId: number, category?: string) => Promise<MediaFileMetadata[]>;
  uploadProjectFile: (
    projectId: number,
    file: File,
    category: ProjectFileCategory,
    onProgress?: (percent: number) => void
  ) => Promise<MediaFileMetadata>;
  replaceProjectFile: (
    projectId: number,
    fileUid: string,
    file: File,
    category?: ProjectFileCategory,
    onProgress?: (percent: number) => void
  ) => Promise<MediaFileMetadata>;
  deleteProjectFile: (projectId: number, fileUid: string) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined);

export const ProjectsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, hasPermission } = useAuth();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<Record<number, MediaFileMetadata[]>>({});
  const [filesLoading, setFilesLoading] = useState<Record<number, boolean>>({});
  const [filesError, setFilesError] = useState<Record<number, string | null>>({});

  const canViewAdminProjects =
    user !== null &&
    (user.role === 'super_admin' ||
      (user.role === 'custom_admin' &&
        (hasPermission('view_projects') || hasPermission('manage_projects'))));

  const isClientUser = user !== null && user.role === 'client';

  const upsertProject = useCallback(
    (incoming: ProjectRecord) => {
      const normalized = isClientUser ? sanitizeProjectForClientView(incoming) : incoming;
      setProjects((prev) => {
        const exists = prev.some((p) => p.id === normalized.id);
        if (!exists) return [normalized, ...prev];
        return prev.map((p) => (p.id === normalized.id ? normalized : p));
      });
      return normalized;
    },
    [isClientUser]
  );

  const fetchProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setProjectFiles({});
      return;
    }
    if (!canViewAdminProjects && !isClientUser) {
      setProjects([]);
      setProjectFiles({});
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const endpoint = isClientUser ? '/api/client/projects' : '/api/projects';
      const res = await apiClient.get(endpoint);
      const rawList = Array.isArray(res.data?.data) ? (res.data.data as ProjectRecord[]) : [];
      setProjects(isClientUser ? rawList.map(sanitizeProjectForClientView) : rawList);
    } catch (err) {
      const info = extractApiError(err, 'Unable to load projects from server.');
      setError(info.message);
    } finally {
      setLoading(false);
    }
  }, [user, canViewAdminProjects, isClientUser]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async (payload: CreateProjectPayload): Promise<ProjectRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.post('/api/projects', {
      ...payload,
      progress_percentage: clampProgressPercentage(payload.progress_percentage ?? 0),
    });
    return upsertProject(res.data.data);
  };

  const updateProject = async (
    projectId: number,
    payload: UpdateProjectPayload
  ): Promise<ProjectRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const body = { ...payload };
    if (body.progress_percentage !== undefined) {
      body.progress_percentage = clampProgressPercentage(body.progress_percentage);
    }
    const res = await apiClient.put(`/api/projects/${projectId}`, body);
    return upsertProject(res.data.data);
  };

  const updateProjectStatus = async (
    projectId: number,
    status: ProjectStatus,
    progress_percentage?: number
  ): Promise<ProjectRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const body: { status: ProjectStatus; progress_percentage?: number } = { status };
    if (progress_percentage !== undefined) {
      body.progress_percentage = clampProgressPercentage(progress_percentage);
    }
    const res = await apiClient.put(`/api/projects/${projectId}/status`, body);
    return upsertProject(res.data.data);
  };

  const deleteProject = async (projectId: number): Promise<void> => {
    await apiClient.get('/sanctum/csrf-cookie');
    await apiClient.delete(`/api/projects/${projectId}`);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  };

  const createMilestone = async (
    projectId: number,
    payload: { title: string; description?: string; due_date?: string; status?: MilestoneStatus }
  ): Promise<ProjectRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.post(`/api/projects/${projectId}/milestones`, payload);
    return upsertProject(res.data.data);
  };

  const updateMilestone = async (
    projectId: number,
    milestoneId: number,
    payload: { title?: string; description?: string; due_date?: string; status?: MilestoneStatus }
  ): Promise<ProjectRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.put(
      `/api/projects/${projectId}/milestones/${milestoneId}`,
      payload
    );
    return upsertProject(res.data.data);
  };

  const reorderMilestones = async (
    projectId: number,
    milestoneIds: number[]
  ): Promise<ProjectRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.put(`/api/projects/${projectId}/milestones/reorder`, {
      milestone_ids: milestoneIds,
    });
    return upsertProject(res.data.data);
  };

  const deleteMilestone = async (
    projectId: number,
    milestoneId: number
  ): Promise<ProjectRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.delete(`/api/projects/${projectId}/milestones/${milestoneId}`);
    return upsertProject(res.data.data);
  };

  const createTask = async (
    projectId: number,
    payload: {
      title: string;
      description?: string;
      milestone_id?: number | null;
      assigned_to?: number | null;
      status?: TaskStatus;
      deadline?: string;
      is_client_visible?: boolean;
    }
  ): Promise<ProjectRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.post(`/api/projects/${projectId}/tasks`, payload);
    return upsertProject(res.data.data);
  };

  const updateTask = async (
    projectId: number,
    taskId: number,
    payload: {
      title?: string;
      description?: string;
      status?: TaskStatus;
      deadline?: string | null;
      assigned_to?: number | null;
      is_client_visible?: boolean;
    }
  ): Promise<ProjectRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.put(`/api/projects/${projectId}/tasks/${taskId}`, payload);
    return upsertProject(res.data.data);
  };

  const deleteTask = async (projectId: number, taskId: number): Promise<ProjectRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.delete(`/api/projects/${projectId}/tasks/${taskId}`);
    return upsertProject(res.data.data);
  };

  const addProjectUpdate = async (
    projectId: number,
    payload: {
      title?: string;
      body: string;
      is_internal?: boolean;
      request_approval?: boolean;
    }
  ): Promise<ProjectRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.post(`/api/projects/${projectId}/updates`, payload);
    return upsertProject(res.data.data);
  };

  const respondToApproval = async (
    projectId: number,
    updateId: number,
    decision: 'approved' | 'changes_requested',
    comment?: string
  ): Promise<ProjectRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const base = isClientUser ? '/api/client/projects' : '/api/projects';
    const res = await apiClient.post(`${base}/${projectId}/approvals/${updateId}/respond`, {
      decision,
      comment,
    });
    return upsertProject(res.data.data);
  };

  const fetchProjectFiles = useCallback(
    async (projectId: number, category?: string): Promise<MediaFileMetadata[]> => {
      if (!user) return [];
      setFilesLoading((prev) => ({ ...prev, [projectId]: true }));
      setFilesError((prev) => ({ ...prev, [projectId]: null }));
      try {
        const list = await mediaService.listProjectFiles(
          projectId,
          isClientUser ? 'client' : 'admin',
          category
        );
        setProjectFiles((prev) => ({ ...prev, [projectId]: list }));
        return list;
      } catch (err) {
        const info = extractApiError(err, 'Unable to load project files from server.');
        setFilesError((prev) => ({ ...prev, [projectId]: info.message }));
        return [];
      } finally {
        setFilesLoading((prev) => ({ ...prev, [projectId]: false }));
      }
    },
    [user, isClientUser]
  );

  const uploadProjectFile = async (
    projectId: number,
    file: File,
    category: ProjectFileCategory,
    onProgress?: (percent: number) => void
  ): Promise<MediaFileMetadata> => {
    const uploaded = await mediaService.uploadProjectFile(projectId, file, category, onProgress);
    await fetchProjectFiles(projectId);
    return uploaded;
  };

  const replaceProjectFile = async (
    projectId: number,
    fileUid: string,
    file: File,
    category?: ProjectFileCategory,
    onProgress?: (percent: number) => void
  ): Promise<MediaFileMetadata> => {
    const updated = await mediaService.replaceProjectFile(
      projectId,
      fileUid,
      file,
      category,
      onProgress
    );
    await fetchProjectFiles(projectId);
    return updated;
  };

  const deleteProjectFile = async (projectId: number, fileUid: string): Promise<void> => {
    await mediaService.deleteProjectFile(projectId, fileUid);
    await fetchProjectFiles(projectId);
  };

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        loading,
        error,
        fetchProjects,
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
        projectFiles,
        filesLoading,
        filesError,
        fetchProjectFiles,
        uploadProjectFile,
        replaceProjectFile,
        deleteProjectFile,
      }}
    >
      {children}
    </ProjectsContext.Provider>
  );
};

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) {
    throw new Error('useProjects must be used within a ProjectsProvider');
  }
  return ctx;
}
