import { AxiosInstance, AxiosProgressEvent } from 'axios';
import { apiClient } from '../lib/apiClient';
import {
  MediaFileMetadata,
  MediaListFilters,
  MediaVisibility,
  ProjectFileCategory,
  TemporaryPreviewHandle,
  UploadMediaOptions,
  isPermanentFileReference,
  validateUploadFile,
} from '../types/media';

/**
 * Creates a short-lived browser Object URL strictly for in-memory preview rendering.
 * Callers must revoke it via handle.revoke() or revokeTemporaryPreviewUrl() once uploaded or unmounted,
 * and must never persist blob: URLs to settings, localStorage, or backend records.
 */
export function createTemporaryPreviewUrl(file: Blob): TemporaryPreviewHandle {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return {
      objectUrl: '',
      revoke: () => undefined,
    };
  }

  const objectUrl = URL.createObjectURL(file);
  let revoked = false;

  return {
    objectUrl,
    revoke: () => {
      if (!revoked && objectUrl && typeof URL.revokeObjectURL === 'function') {
        revoked = true;
        URL.revokeObjectURL(objectUrl);
      }
    },
  };
}

export function revokeTemporaryPreviewUrl(url: string | null | undefined): void {
  if (
    url &&
    url.startsWith('blob:') &&
    typeof URL !== 'undefined' &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    URL.revokeObjectURL(url);
  }
}

function buildProgressHandler(onProgress?: (percent: number) => void) {
  if (!onProgress) return undefined;
  return (evt: AxiosProgressEvent) => {
    if (!evt.total || evt.total <= 0) return;
    const pct = Math.min(100, Math.max(0, Math.round((evt.loaded / evt.total) * 100)));
    onProgress(pct);
  };
}

export function createMediaService(client: AxiosInstance = apiClient) {
  const ensureCsrf = async () => {
    await client.get('/sanctum/csrf-cookie');
  };

  const assertConfirmedPersistentMetadata = (record: MediaFileMetadata): MediaFileMetadata => {
    // Internal disk/path/checksum fields are intentionally not exposed by the API.
    // A persistent file UID plus a stable server-generated URL is the public contract.
    if (
      !record?.file_uid ||
      !record?.original_filename ||
      !record?.mime_type ||
      !record?.url ||
      !isPermanentFileReference(record.url)
    ) {
      throw new Error('Server did not confirm persistent storage metadata.');
    }
    return record;
  };

  return {
    async listMediaFiles(filters: MediaListFilters = {}): Promise<MediaFileMetadata[]> {
      const res = await client.get('/api/media', { params: filters });
      const items = res.data?.data ?? [];
      return Array.isArray(items) ? items : [];
    },

    async getMediaFile(fileUid: string): Promise<MediaFileMetadata> {
      const res = await client.get(`/api/media/${encodeURIComponent(fileUid)}`);
      return res.data?.data ?? res.data;
    },

    async uploadMediaFile(
      file: File,
      options: UploadMediaOptions
    ): Promise<MediaFileMetadata> {
      const check = validateUploadFile(file, options.visibility);
      if (!check.valid) {
        throw new Error(check.error || 'File validation failed.');
      }

      await ensureCsrf();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('visibility', options.visibility);
      formData.append('category', options.category);
      if (options.ownerType) {
        formData.append('owner_type', options.ownerType);
      }
      if (options.ownerId !== undefined) {
        formData.append('owner_id', String(options.ownerId));
      }

      const res = await client.post('/api/media', formData, {
        // Let the browser/Axios set multipart Content-Type with its required boundary.
        onUploadProgress: buildProgressHandler(options.onProgress),
      });

      return assertConfirmedPersistentMetadata(res.data?.data ?? res.data);
    },

    async replaceMediaFile(
      fileUid: string,
      file: File,
      visibility: MediaVisibility,
      onProgress?: (percent: number) => void
    ): Promise<MediaFileMetadata> {
      const check = validateUploadFile(file, visibility);
      if (!check.valid) {
        throw new Error(check.error || 'Replacement file validation failed.');
      }

      await ensureCsrf();

      const formData = new FormData();
      formData.append('file', file);

      const res = await client.post(
        `/api/media/${encodeURIComponent(fileUid)}/replace`,
        formData,
        {
          // Let the browser/Axios set multipart Content-Type with its required boundary.
          onUploadProgress: buildProgressHandler(onProgress),
        }
      );

      return assertConfirmedPersistentMetadata(res.data?.data ?? res.data);
    },

    async deleteMediaFile(fileUid: string): Promise<void> {
      await ensureCsrf();
      await client.delete(`/api/media/${encodeURIComponent(fileUid)}`);
    },

    async listProjectFiles(
      projectId: number,
      mode: 'admin' | 'client',
      category?: string
    ): Promise<MediaFileMetadata[]> {
      const base = mode === 'client' ? '/api/client/projects' : '/api/projects';
      const params: Record<string, string> = {};
      if (category && category !== 'all') {
        params.category = category;
      }
      const res = await client.get(`${base}/${projectId}/files`, { params });
      const items = res.data?.data;
      if (!Array.isArray(items)) {
        throw new Error('The project files endpoint returned an invalid response.');
      }
      return items as MediaFileMetadata[];
    },

    async uploadProjectFile(
      projectId: number,
      file: File,
      category: ProjectFileCategory,
      onProgress?: (percent: number) => void
    ): Promise<MediaFileMetadata> {
      const check = validateUploadFile(file, 'private');
      if (!check.valid) {
        throw new Error(check.error || 'File validation failed.');
      }

      await ensureCsrf();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);

      const res = await client.post(`/api/projects/${projectId}/files`, formData, {
        // Let the browser/Axios set multipart Content-Type with its required boundary.
        onUploadProgress: buildProgressHandler(onProgress),
      });

      return assertConfirmedPersistentMetadata(res.data?.data ?? res.data);
    },

    async replaceProjectFile(
      projectId: number,
      fileUid: string,
      file: File,
      category?: ProjectFileCategory,
      onProgress?: (percent: number) => void
    ): Promise<MediaFileMetadata> {
      const check = validateUploadFile(file, 'private');
      if (!check.valid) {
        throw new Error(check.error || 'Replacement file validation failed.');
      }

      await ensureCsrf();

      const formData = new FormData();
      formData.append('file', file);
      if (category) {
        formData.append('category', category);
      }

      const res = await client.post(
        `/api/projects/${projectId}/files/${encodeURIComponent(fileUid)}/replace`,
        formData,
        {
          // Let the browser/Axios set multipart Content-Type with its required boundary.
          onUploadProgress: buildProgressHandler(onProgress),
        }
      );

      return assertConfirmedPersistentMetadata(res.data?.data ?? res.data);
    },

    async deleteProjectFile(projectId: number, fileUid: string): Promise<void> {
      await ensureCsrf();
      await client.delete(`/api/projects/${projectId}/files/${encodeURIComponent(fileUid)}`);
    },

    async getSignedDownloadUrl(fileUid: string, ttlMinutes = 5): Promise<string> {
      await ensureCsrf();
      const res = await client.post(
        `/api/media/${encodeURIComponent(fileUid)}/signed-url`,
        { ttl_minutes: ttlMinutes }
      );
      const signedUrl: string = res.data?.data?.signed_url ?? res.data?.signed_url ?? '';
      if (!isPermanentFileReference(signedUrl)) {
        throw new Error('Server returned an invalid download link.');
      }
      return signedUrl;
    },

    getAuthorizedDownloadUrl(fileUid: string, asAttachment = true): string {
      return `/api/media/${encodeURIComponent(fileUid)}/download?download=${asAttachment ? '1' : '0'}`;
    },

    async fetchAuthorizedPreviewBlob(fileUid: string): Promise<TemporaryPreviewHandle> {
      const res = await client.get(
        `/api/media/${encodeURIComponent(fileUid)}/download`,
        {
          params: { download: 0 },
          responseType: 'blob',
        }
      );
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
      return createTemporaryPreviewUrl(blob);
    },

    async downloadAuthorizedFile(
      fileUid: string,
      originalFilename: string
    ): Promise<void> {
      const signedUrl = await this.getSignedDownloadUrl(fileUid, 5);
      if (typeof document !== 'undefined') {
        const anchor = document.createElement('a');
        anchor.href = signedUrl;
        anchor.download = originalFilename;
        anchor.rel = 'noopener noreferrer';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }
    },
  };
}

export const mediaService = createMediaService();
export const {
  listMediaFiles,
  getMediaFile,
  uploadMediaFile,
  replaceMediaFile,
  deleteMediaFile,
  listProjectFiles,
  uploadProjectFile,
  replaceProjectFile,
  deleteProjectFile,
  getSignedDownloadUrl,
  getAuthorizedDownloadUrl,
  fetchAuthorizedPreviewBlob,
  downloadAuthorizedFile,
} = mediaService;
