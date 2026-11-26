import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  Download,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Replace,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useProjects } from '../../contexts/ProjectsContext';
import { extractApiError } from '../../lib/apiClient';
import {
  createTemporaryPreviewUrl,
  mediaService,
  revokeTemporaryPreviewUrl,
} from '../../services/mediaService';
import {
  MediaFileMetadata,
  PROJECT_FILE_CATEGORIES,
  ProjectFileCategory,
  formatFileSize,
  getProjectFileCategoryLabel,
  isPreviewableMimeType,
  validateUploadFile,
} from '../../types/media';
import { ProjectRecord } from '../../types/project';
import FilePreviewModal from '../common/FilePreviewModal';

interface AdminProjectFilesProps {
  project: ProjectRecord;
  canUpload: boolean;
  canReplace: boolean;
  canDelete: boolean;
}

const ACCEPTED_PROJECT_EXTENSIONS =
  '.pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx,.pptx,.zip';

const AdminProjectFiles: React.FC<AdminProjectFilesProps> = ({
  project,
  canUpload,
  canReplace,
  canDelete,
}) => {
  const { language, dir } = useLanguage();
  const {
    projectFiles,
    filesLoading,
    filesError,
    fetchProjectFiles,
    uploadProjectFile,
    replaceProjectFile,
    deleteProjectFile,
  } = useProjects();

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ProjectFileCategory>('deliverable');
  const [tempPreviewUrl, setTempPreviewUrl] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Per-item action states
  const [replacingUid, setReplacingUid] = useState<string | null>(null);
  const [replaceProgress, setReplaceProgress] = useState(0);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [downloadingUid, setDownloadingUid] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<MediaFileMetadata | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const pendingReplaceTargetRef = useRef<MediaFileMetadata | null>(null);
  const activePreviewsRef = useRef<Set<string>>(new Set());

  const files = projectFiles[project.id] || [];
  const loading = Boolean(filesLoading[project.id]);
  const error = filesError[project.id] || null;

  useEffect(() => {
    fetchProjectFiles(project.id);
    setConfirmDeleteUid(null);
  }, [project.id, fetchProjectFiles]);

  useEffect(() => {
    const previews = activePreviewsRef.current;
    return () => {
      previews.forEach((url) => revokeTemporaryPreviewUrl(url));
      previews.clear();
    };
  }, []);

  const clearSelectedFile = () => {
    if (tempPreviewUrl) {
      revokeTemporaryPreviewUrl(tempPreviewUrl);
      activePreviewsRef.current.delete(tempPreviewUrl);
    }
    setTempPreviewUrl('');
    setSelectedFile(null);
    setUploadError(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const check = validateUploadFile(file, 'private');
    if (!check.valid) {
      clearSelectedFile();
      setUploadError(check.error || 'Unsupported file.');
      return;
    }

    if (tempPreviewUrl) {
      revokeTemporaryPreviewUrl(tempPreviewUrl);
      activePreviewsRef.current.delete(tempPreviewUrl);
    }

    setUploadError(null);
    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const handle = createTemporaryPreviewUrl(file);
      if (handle.objectUrl) {
        activePreviewsRef.current.add(handle.objectUrl);
        setTempPreviewUrl(handle.objectUrl);
      }
    } else {
      setTempPreviewUrl('');
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpload || !selectedFile) return;

    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);
    try {
      await uploadProjectFile(project.id, selectedFile, selectedCategory, (pct) => {
        setUploadProgress(pct);
      });
      clearSelectedFile();
      toast.success(
        language === 'ar'
          ? 'تم حفظ الملف وتأكيد بياناته بنجاح'
          : 'File persisted and metadata confirmed'
      );
    } catch (err) {
      const msg = extractApiError(
        err,
        language === 'ar' ? 'فشل رفع الملف.' : 'File upload failed.'
      ).message;
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const triggerReplaceFor = (file: MediaFileMetadata) => {
    if (!canReplace) return;
    pendingReplaceTargetRef.current = file;
    if (replaceInputRef.current) {
      replaceInputRef.current.value = '';
      replaceInputRef.current.click();
    }
  };

  const handleReplaceInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFile = e.target.files?.[0];
    const target = pendingReplaceTargetRef.current;
    e.target.value = '';
    pendingReplaceTargetRef.current = null;
    if (!newFile || !target || !canReplace) return;

    const check = validateUploadFile(newFile, 'private');
    if (!check.valid) {
      toast.error(check.error || 'Unsupported replacement file.');
      return;
    }

    setReplacingUid(target.file_uid);
    setReplaceProgress(0);
    try {
      await replaceProjectFile(
        project.id,
        target.file_uid,
        newFile,
        target.category as ProjectFileCategory,
        (pct) => setReplaceProgress(pct)
      );
      toast.success(
        language === 'ar' ? 'تم استبدال الملف بنجاح' : 'Project file replaced'
      );
    } catch (err) {
      toast.error(
        extractApiError(
          err,
          language === 'ar' ? 'تعذر استبدال الملف.' : 'Failed to replace file.'
        ).message
      );
    } finally {
      setReplacingUid(null);
      setReplaceProgress(0);
    }
  };

  const handleConfirmDelete = async (fileUid: string) => {
    if (!canDelete) return;
    setDeletingUid(fileUid);
    try {
      await deleteProjectFile(project.id, fileUid);
      setConfirmDeleteUid(null);
      toast.success(language === 'ar' ? 'تم حذف الملف بنجاح' : 'Project file deleted');
    } catch (err) {
      toast.error(
        extractApiError(
          err,
          language === 'ar' ? 'تعذر حذف الملف.' : 'Failed to delete file.'
        ).message
      );
    } finally {
      setDeletingUid(null);
    }
  };

  const handleDownload = async (file: MediaFileMetadata) => {
    setDownloadingUid(file.file_uid);
    try {
      await mediaService.downloadAuthorizedFile(file.file_uid, file.original_filename);
    } catch (err) {
      toast.error(
        extractApiError(
          err,
          language === 'ar' ? 'تعذر تحميل الملف.' : 'Failed to download file.'
        ).message
      );
    } finally {
      setDownloadingUid(null);
    }
  };

  const filteredFiles = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return files.filter((file) => {
      if (categoryFilter !== 'all' && file.category !== categoryFilter) {
        return false;
      }
      if (!term) return true;
      return (
        file.original_filename.toLowerCase().includes(term) ||
        getProjectFileCategoryLabel(file.category, language).toLowerCase().includes(term) ||
        (file.uploader?.name || '').toLowerCase().includes(term)
      );
    });
  }, [files, categoryFilter, searchTerm, language]);

  return (
    <div className="space-y-5" dir={dir}>
      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPTED_PROJECT_EXTENSIONS}
        className="hidden"
        onChange={handleReplaceInputChange}
      />

      {canUpload && (
        <form
          onSubmit={handleUploadSubmit}
          className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-white">
                {language === 'ar'
                  ? 'رفع مستند أو مخرج للمشروع'
                  : 'Upload Project Document or Deliverable'}
              </h4>
              <p className="text-[11px] text-slate-400">
                {language === 'ar'
                  ? `مرتبط بالمشروع ${project.project_code} والعميل ${project.client?.full_name || `#${project.client_id}`}`
                  : `Stored privately for ${project.project_code} • Client: ${project.client?.full_name || `#${project.client_id}`}`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                {language === 'ar' ? 'تصنيف الملف' : 'File Category'}
              </label>
              <select
                value={selectedCategory}
                disabled={uploading}
                onChange={(e) => setSelectedCategory(e.target.value as ProjectFileCategory)}
                className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
              >
                {PROJECT_FILE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {language === 'ar' ? cat.labelAr : cat.labelEn}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                {language === 'ar' ? 'اختر الملف (الحد الأقصى 15 ميجابايت)' : 'Select File (max 15 MB)'}
              </label>
              <label className="flex items-center justify-between gap-2 rounded-xl bg-slate-900 border border-dashed border-slate-700 hover:border-sky-500/60 px-3 py-2 text-xs text-slate-300 cursor-pointer">
                <span className="truncate">
                  {selectedFile
                    ? `${selectedFile.name} (${formatFileSize(selectedFile.size)})`
                    : language === 'ar'
                    ? 'اختر PDF، مستند، تصميم أو أرشيف...'
                    : 'Choose PDF, Doc, Design, Sheet, or ZIP...'}
                </span>
                <Upload className="w-4 h-4 text-sky-400 shrink-0" />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_PROJECT_EXTENSIONS}
                  disabled={uploading}
                  onChange={handleSelectFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {selectedFile && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                {tempPreviewUrl ? (
                  <img
                    src={tempPreviewUrl}
                    alt="Temporary preview"
                    className="w-12 h-12 rounded-lg object-cover border border-slate-700 shrink-0"
                  />
                ) : (
                  <FileText className="w-5 h-5 text-sky-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-white truncate">{selectedFile.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatFileSize(selectedFile.size)} •{' '}
                    {getProjectFileCategoryLabel(selectedCategory, language)}
                  </p>
                </div>
              </div>

              {!uploading && (
                <button
                  type="button"
                  onClick={clearSelectedFile}
                  aria-label="Clear selected file"
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {uploading && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-sky-300 font-semibold">
                <span>{language === 'ar' ? 'جارٍ الرفع إلى التخزين الآمن...' : 'Uploading to persistent storage...'}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                <div
                  className="h-full bg-sky-500 transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {uploadError && (
            <div
              role="alert"
              className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={uploading || !selectedFile}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-xs cursor-pointer"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>
              {uploading
                ? language === 'ar'
                  ? 'جارٍ الرفع...'
                  : 'Uploading...'
                : language === 'ar'
                ? 'رفع وحفظ الملف'
                : 'Upload & Link File'}
            </span>
          </button>
        </form>
      )}

      {/* Filter & Refresh Bar */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                language === 'ar'
                  ? 'بحث باسم الملف أو الرافع...'
                  : 'Search filename or uploader...'
              }
              className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-9 pe-3 py-2 text-xs text-white"
            />
          </div>

          <select
            aria-label="Filter project files by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
          >
            <option value="all">
              {language === 'ar' ? 'جميع التصنيفات' : 'All Categories'}
            </option>
            {PROJECT_FILE_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {language === 'ar' ? cat.labelAr : cat.labelEn}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => fetchProjectFiles(project.id)}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{language === 'ar' ? 'تحديث القائمة' : 'Refresh'}</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchProjectFiles(project.id)}
            className="underline font-bold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {loading && files.length === 0 ? (
        <div className="flex items-center gap-2 p-6 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
          <span>Loading project files...</span>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="p-8 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-500">
          {files.length === 0
            ? language === 'ar'
              ? 'لا توجد ملفات مرفوعة لهذا المشروع بعد.'
              : 'No files uploaded to this project yet.'
            : language === 'ar'
            ? 'لا توجد ملفات مطابقة للبحث.'
            : 'No project files match your filters.'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredFiles.map((file) => {
            const isReplacing = replacingUid === file.file_uid;
            const isConfirmingDelete = confirmDeleteUid === file.file_uid;
            const isDeleting = deletingUid === file.file_uid;
            const isDownloading = downloadingUid === file.file_uid;
            const canPreview = isPreviewableMimeType(file.mime_type);

            return (
              <div
                key={file.file_uid}
                className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5 text-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white truncate">
                          {file.original_filename}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 font-semibold">
                          {getProjectFileCategoryLabel(file.category, language)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formatFileSize(file.file_size)} •{' '}
                        {language === 'ar' ? 'بواسطة:' : 'Uploaded by:'}{' '}
                        {file.uploader?.name || (language === 'ar' ? 'غير محدد' : 'Unknown')} •{' '}
                        {new Date(file.updated_at || file.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {canPreview && (
                      <button
                        type="button"
                        onClick={() => setPreviewFile(file)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'معاينة' : 'Preview'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={() => handleDownload(file)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-bold cursor-pointer disabled:opacity-60"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>{language === 'ar' ? 'تحميل' : 'Download'}</span>
                    </button>

                    {canReplace && (
                      <button
                        type="button"
                        disabled={isReplacing}
                        onClick={() => triggerReplaceFor(file)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-semibold cursor-pointer disabled:opacity-60"
                      >
                        {isReplacing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Replace className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isReplacing
                            ? `${replaceProgress}%`
                            : language === 'ar'
                            ? 'استبدال'
                            : 'Replace'}
                        </span>
                      </button>
                    )}

                    {canDelete && (
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() =>
                          setConfirmDeleteUid(isConfirmingDelete ? null : file.file_uid)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'حذف' : 'Delete'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {isConfirmingDelete && canDelete && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30">
                    <span className="text-rose-200 font-semibold">
                      {language === 'ar'
                        ? `تأكيد حذف "${file.original_filename}" نهائياً؟`
                        : `Permanently delete "${file.original_filename}" from storage?`}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleConfirmDelete(file.file_uid)}
                        className="px-3 py-1 rounded-md bg-rose-500 hover:bg-rose-400 text-white font-bold cursor-pointer disabled:opacity-60"
                      >
                        {isDeleting
                          ? language === 'ar'
                            ? 'جارٍ الحذف...'
                            : 'Deleting...'
                          : language === 'ar'
                          ? 'تأكيد الحذف'
                          : 'Confirm Delete'}
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setConfirmDeleteUid(null)}
                        className="px-3 py-1 rounded-md bg-slate-800 text-slate-300 font-semibold cursor-pointer"
                      >
                        {language === 'ar' ? 'إلغاء' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={handleDownload}
      />
    </div>
  );
};

export default AdminProjectFiles;
