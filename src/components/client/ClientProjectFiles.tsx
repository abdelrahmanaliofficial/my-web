import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useProjects } from '../../contexts/ProjectsContext';
import { extractApiError } from '../../lib/apiClient';
import { mediaService } from '../../services/mediaService';
import {
  MediaFileMetadata,
  PROJECT_FILE_CATEGORIES,
  formatFileSize,
  getProjectFileCategoryLabel,
  isPreviewableMimeType,
} from '../../types/media';
import FilePreviewModal from '../common/FilePreviewModal';

interface ClientProjectFilesProps {
  projectId: number;
  projectName?: string;
}

const ClientProjectFiles: React.FC<ClientProjectFilesProps> = ({ projectId }) => {
  const { language, dir } = useLanguage();
  const { projectFiles, filesLoading, filesError, fetchProjectFiles } = useProjects();

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadingUid, setDownloadingUid] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<MediaFileMetadata | null>(null);

  const files = projectFiles[projectId] || [];
  const loading = Boolean(filesLoading[projectId]);
  const error = filesError[projectId] || null;

  useEffect(() => {
    fetchProjectFiles(projectId);
  }, [projectId, fetchProjectFiles]);

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

  const handleDownload = async (file: MediaFileMetadata) => {
    setDownloadingUid(file.file_uid);
    try {
      await mediaService.downloadAuthorizedFile(file.file_uid, file.original_filename);
    } catch (err) {
      toast.error(
        extractApiError(
          err,
          language === 'ar' ? 'تعذر تحميل الملف المصرح به.' : 'Unable to download file.'
        ).message
      );
    } finally {
      setDownloadingUid(null);
    }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-slate-800/80" dir={dir}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
          <span>
            {language === 'ar'
              ? `ملفات المشروع ومخرجاته (${files.length})`
              : `Project Files & Deliverables (${files.length})`}
          </span>
        </h4>

        <button
          type="button"
          onClick={() => fetchProjectFiles(projectId)}
          disabled={loading}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>{language === 'ar' ? 'تحديث' : 'Refresh'}</span>
        </button>
      </div>

      {/* Category filter + search */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              language === 'ar' ? 'ابحث باسم الملف...' : 'Search by filename...'
            }
            className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-9 pe-3 py-2 text-xs text-white"
          />
        </div>

        <select
          aria-label={language === 'ar' ? 'تصفية حسب الفئة' : 'Filter by category'}
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
            onClick={() => fetchProjectFiles(projectId)}
            className="underline font-bold cursor-pointer"
          >
            {language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}

      {loading && files.length === 0 ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
          <span>
            {language === 'ar' ? 'جارٍ تحميل ملفات المشروع...' : 'Loading project files...'}
          </span>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-500 text-center">
          {files.length === 0
            ? language === 'ar'
              ? 'لا توجد ملفات أو مخرجات مرفوعة لهذا المشروع حتى الآن.'
              : 'No documents or deliverables have been shared for this project yet.'
            : language === 'ar'
            ? 'لا توجد ملفات مطابقة لمعايير البحث.'
            : 'No files match the selected filter.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFiles.map((file) => {
            const canPreview = isPreviewableMimeType(file.mime_type);
            const isDownloading = downloadingUid === file.file_uid;

            return (
              <div
                key={file.file_uid}
                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
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
                      {formatFileSize(file.file_size)}
                      {file.uploader?.name ? ` • ${file.uploader.name}` : ''}
                      {' • '}
                      {new Date(file.updated_at || file.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
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
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-bold cursor-pointer disabled:opacity-60"
                  >
                    {isDownloading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>{language === 'ar' ? 'تحميل' : 'Download'}</span>
                  </button>
                </div>
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

export default ClientProjectFiles;
