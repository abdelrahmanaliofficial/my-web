export type MediaVisibility = 'public' | 'private';

export type ProjectFileCategory =
  | 'contract'
  | 'requirement'
  | 'design'
  | 'report'
  | 'document'
  | 'deliverable'
  | 'attachment';

export type MediaCategory =
  | 'site_logo'
  | 'portfolio_image'
  | 'hero_media'
  | 'project_document'
  | 'invoice'
  | 'confidential_attachment'
  | ProjectFileCategory;

export type MediaOwnerType = 'client' | 'project';

export interface MediaUploaderSummary {
  id: number;
  name: string;
  email?: string;
  role?: string;
}

export interface MediaFileMetadata {
  id: number;
  file_uid: string;
  visibility: MediaVisibility;
  category: string;
  original_filename: string;
  /** Internal storage metadata is persisted server-side and is not exposed by the API. */
  stored_filename?: string;
  disk?: string;
  storage_path?: string;
  mime_type: string;
  extension: string;
  file_size: number;
  checksum_sha256?: string | null;
  owner_type?: string | null;
  owner_id?: number | null;
  client_id?: number | null;
  uploaded_by?: number;
  uploader?: MediaUploaderSummary | null;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface TemporaryPreviewHandle {
  objectUrl: string;
  revoke: () => void;
}

export interface UploadMediaOptions {
  visibility: MediaVisibility;
  category: MediaCategory | string;
  ownerType?: MediaOwnerType;
  ownerId?: number;
  onProgress?: (percent: number) => void;
}

export const PROJECT_FILE_CATEGORIES: Array<{
  value: ProjectFileCategory;
  labelEn: string;
  labelAr: string;
}> = [
  { value: 'contract', labelEn: 'Contracts', labelAr: 'العقود' },
  { value: 'requirement', labelEn: 'Requirements', labelAr: 'المتطلبات' },
  { value: 'design', labelEn: 'Designs', labelAr: 'التصاميم' },
  { value: 'report', labelEn: 'Reports', labelAr: 'التقارير' },
  { value: 'document', labelEn: 'Documents', labelAr: 'المستندات' },
  { value: 'deliverable', labelEn: 'Deliverables', labelAr: 'المخرجات والتسليمات' },
  { value: 'attachment', labelEn: 'Other project attachments', labelAr: 'مرفقات المشروع الأخرى' },
];

export function getProjectFileCategoryLabel(
  category: string,
  language: 'ar' | 'en' = 'en'
): string {
  const found = PROJECT_FILE_CATEGORIES.find((c) => c.value === category);
  if (!found) return category.replace(/_/g, ' ');
  return language === 'ar' ? found.labelAr : found.labelEn;
}

export interface MediaListFilters {
  visibility?: MediaVisibility;
  category?: string;
  owner_type?: MediaOwnerType;
  owner_id?: number;
  per_page?: number;
  page?: number;
}

export const BLOCKED_MEDIA_EXTENSIONS = new Set([
  'php',
  'phtml',
  'phar',
  'php3',
  'php4',
  'php5',
  'php7',
  'php8',
  'exe',
  'dll',
  'msi',
  'com',
  'bat',
  'cmd',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'js',
  'mjs',
  'cjs',
  'vbs',
  'wsf',
  'hta',
  'html',
  'htm',
  'svg',
  'svgz',
  'pl',
  'py',
  'rb',
  'cgi',
  'asp',
  'aspx',
  'jsp',
  'htaccess',
  'env',
]);

export const PUBLIC_ALLOWED_MIME_MAP: Record<string, string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
};

export const PRIVATE_ALLOWED_MIME_MAP: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'text/plain': ['txt', 'csv'],
  'text/csv': ['csv'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'application/zip': ['zip'],
};

export const MAX_BYTES_PUBLIC_IMAGE = 5 * 1024 * 1024;
export const MAX_BYTES_PUBLIC_VIDEO = 25 * 1024 * 1024;
export const MAX_BYTES_PRIVATE_DOCUMENT = 15 * 1024 * 1024;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  extension?: string;
  mimeType?: string;
}

export function validateUploadFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  visibility: MediaVisibility
): FileValidationResult {
  const rawName = (file.name || '').replace(/\0/g, '');
  const baseName = rawName.split(/[/\\]/).pop() || '';
  if (!baseName || rawName.includes('..')) {
    return { valid: false, error: 'Invalid filename.' };
  }

  const segments = baseName.toLowerCase().split('.');
  if (segments.length < 2) {
    return { valid: false, error: 'File must have a valid extension.' };
  }

  const extension = segments[segments.length - 1];
  for (const segment of segments.slice(1)) {
    if (BLOCKED_MEDIA_EXTENSIONS.has(segment)) {
      return {
        valid: false,
        error: 'Executable or scriptable files are not permitted.',
      };
    }
  }

  const mimeType = (file.type || '').toLowerCase();
  const allowedMap = visibility === 'public' ? PUBLIC_ALLOWED_MIME_MAP : PRIVATE_ALLOWED_MIME_MAP;
  const allowedExtensions = allowedMap[mimeType];

  if (!allowedExtensions || !allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `Unsupported file type (${mimeType || 'unknown'} / .${extension}) for ${visibility} storage.`,
    };
  }

  const maxBytes =
    visibility === 'private'
      ? MAX_BYTES_PRIVATE_DOCUMENT
      : mimeType.startsWith('video/')
        ? MAX_BYTES_PUBLIC_VIDEO
        : MAX_BYTES_PUBLIC_IMAGE;

  if (!file.size || file.size <= 0 || file.size > maxBytes) {
    return {
      valid: false,
      error: 'File exceeds the maximum allowed size limit.',
    };
  }

  return {
    valid: true,
    extension,
    mimeType,
  };
}

/**
 * Ensures temporary browser references (blob:) and inline Base64 payloads (data:)
 * are never saved as permanent media references in settings or database fields.
 */
export function isPermanentFileReference(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('blob:') ||
    lower.startsWith('data:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:')
  ) {
    return false;
  }

  if (trimmed.startsWith('/storage/') || trimmed.startsWith('/api/media/')) {
    return !trimmed.includes('..');
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function sanitizePersistedMediaUrl(url: string | null | undefined): string {
  return isPermanentFileReference(url) ? (url as string).trim() : '';
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, idx);
  return `${val >= 10 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}

export function isPreviewableMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  const lower = mimeType.toLowerCase();
  return (
    lower === 'image/png' ||
    lower === 'image/jpeg' ||
    lower === 'image/webp' ||
    lower === 'application/pdf' ||
    lower === 'text/plain' ||
    lower === 'text/csv'
  );
}

