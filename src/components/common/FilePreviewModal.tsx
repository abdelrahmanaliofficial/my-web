import React, { useEffect, useState } from 'react';
import { Download, FileText, Loader2, X, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { extractApiError } from '../../lib/apiClient';
import { mediaService } from '../../services/mediaService';
import {
  MediaFileMetadata,
  TemporaryPreviewHandle,
  formatFileSize,
  getProjectFileCategoryLabel,
} from '../../types/media';

interface FilePreviewModalProps {
  file: MediaFileMetadata | null;
  onClose: () => void;
  onDownload: (file: MediaFileMetadata) => Promise<void> | void;
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file,
  onClose,
  onDownload,
}) => {
  const { language, dir } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setObjectUrl('');
      setTextContent(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let activeHandle: TemporaryPreviewHandle | null = null;

    setLoading(true);
    setError(null);
    setObjectUrl('');
    setTextContent(null);

    const mime = (file.mime_type || '').toLowerCase();
    const isText = mime === 'text/plain' || mime === 'text/csv';

    mediaService
      .fetchAuthorizedPreviewBlob(file.file_uid)
      .then(async (handle) => {
        if (cancelled) {
          handle.revoke();
          return;
        }
        activeHandle = handle;

        if (isText && handle.objectUrl) {
          const resp = await fetch(handle.objectUrl);
          const content = await resp.text();
          if (!cancelled) {
            setTextContent(content);
          }
          handle.revoke();
          activeHandle = null;
        } else {
          setObjectUrl(handle.objectUrl);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            extractApiError(
              err,
              language === 'ar'
                ? 'تعذر تحميل معاينة الملف المصرح بها.'
                : 'Unable to load authorized file preview.'
            ).message
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (activeHandle) {
        activeHandle.revoke();
        activeHandle = null;
      }
    };
  }, [file, language]);

  if (!file) return null;

  const mime = (file.mime_type || '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      dir={dir}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-white truncate">
              {file.original_filename}
            </h4>
            <p className="text-[11px] text-slate-400">
              {getProjectFileCategoryLabel(file.category, language)} •{' '}
              {formatFileSize(file.file_size)}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onDownload(file)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'تحميل' : 'Download'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-slate-950/70 min-h-[340px] flex items-center justify-center">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              <span>
                {language === 'ar' ? 'جارٍ تحضير المعاينة...' : 'Loading authorized preview...'}
              </span>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : isImage && objectUrl ? (
            <img
              src={objectUrl}
              alt={file.original_filename}
              className="max-h-[70vh] max-w-full object-contain rounded-xl border border-slate-800"
            />
          ) : isPdf && objectUrl ? (
            <iframe
              title={file.original_filename}
              src={objectUrl}
              className="w-full h-[70vh] rounded-xl border border-slate-800 bg-white"
            />
          ) : textContent !== null ? (
            <pre className="w-full max-h-[70vh] overflow-auto p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap font-mono">
              {textContent}
            </pre>
          ) : (
            <div className="text-center space-y-2 text-slate-400 text-sm">
              <FileText className="w-8 h-8 mx-auto text-slate-500" />
              <p>
                {language === 'ar'
                  ? 'المعاينة المباشرة غير متوفرة لهذا النوع، يمكنك تحميل الملف.'
                  : 'Inline preview is not available for this file type. Use Download above.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;
