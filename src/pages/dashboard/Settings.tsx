import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Image as ImageIcon, Link as LinkIcon, Upload, X, Save } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { LogoDisplayMode, useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { extractApiError } from '../../lib/apiClient';
import {
  createTemporaryPreviewUrl,
  revokeTemporaryPreviewUrl,
  uploadMediaFile,
} from '../../services/mediaService';
import { isPermanentFileReference, validateUploadFile } from '../../types/media';

export default function Settings() {
  const { dir } = useLanguage();
  const { settings, heroMedia, updateSettings, updateHeroMedia, loading: settingsLoading, error: settingsError, refreshSettings } = useSettings();
  const { hasPermission } = useAuth();
  const canManageSettings = hasPermission('manage_settings');

  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [darkLogoUrlInput, setDarkLogoUrlInput] = useState('');
  const [showLogoUrlInput, setShowLogoUrlInput] = useState(false);
  const [showDarkLogoUrlInput, setShowDarkLogoUrlInput] = useState(false);
  const [tempLogoPreview, setTempLogoPreview] = useState<string>('');
  const [tempDarkLogoPreview, setTempDarkLogoPreview] = useState<string>('');
  const activePreviewsRef = useRef<Set<string>>(new Set());
  const [heroImageUrl, setHeroImageUrl] = useState(heroMedia.image_path || '');
  const [heroVideoUrl, setHeroVideoUrl] = useState(heroMedia.video_path || '');
  const [activeMediaType, setActiveMediaType] = useState<'image' | 'video' | 'animation'>(
    heroMedia.active_media_type || 'image'
  );

  useEffect(() => {
    const previews = activePreviewsRef.current;
    return () => {
      previews.forEach((url) => revokeTemporaryPreviewUrl(url));
      previews.clear();
    };
  }, []);


  const persistSettings = async (
    next: Parameters<typeof updateSettings>[0],
    successMessage: string
  ) => {
    try {
      await updateSettings(next);
      toast.success(successMessage);
      return true;
    } catch (error) {
      toast.error(extractApiError(error, dir === 'rtl' ? 'تعذر حفظ الإعدادات' : 'Unable to save settings').message);
      return false;
    }
  };

  const uploadPublicLogo = async (
    file: File,
    variant: 'logo_url' | 'logo_dark_url',
    setTempPreview: React.Dispatch<React.SetStateAction<string>>,
    successMessage: string
  ) => {
    const validation = validateUploadFile(file, 'public');
    if (!validation.valid) {
      toast.error(validation.error || (dir === 'rtl' ? 'ملف غير صالح' : 'Invalid file'));
      return;
    }

    const preview = createTemporaryPreviewUrl(file);
    if (preview.objectUrl) {
      activePreviewsRef.current.add(preview.objectUrl);
      setTempPreview(preview.objectUrl);
    }

    try {
      const uploaded = await uploadMediaFile(file, {
        visibility: 'public',
        category: 'site_logo',
      });
      await updateSettings({
        appearance: { ...settings.appearance, [variant]: uploaded.url },
      });
      toast.success(successMessage);
    } catch (error) {
      toast.error(extractApiError(error, dir === 'rtl' ? 'فشل رفع الشعار' : 'Failed to upload logo').message);
    } finally {
      if (preview.objectUrl) {
        preview.revoke();
        activePreviewsRef.current.delete(preview.objectUrl);
      }
      setTempPreview('');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageSettings) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      await uploadPublicLogo(
        file,
        'logo_url',
        setTempLogoPreview,
        dir === 'rtl' ? 'تم تحديث الشعار' : 'Logo updated'
      );
    }
  };

  const handleDarkLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageSettings) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      await uploadPublicLogo(
        file,
        'logo_dark_url',
        setTempDarkLogoPreview,
        dir === 'rtl' ? 'تم تحديث الشعار الداكن' : 'Dark logo updated'
      );
    }
  };

  const handleSaveHeroMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSettings) return;
    try {
      await updateHeroMedia({
        active_media_type: activeMediaType,
        image_path: heroImageUrl,
        video_path: heroVideoUrl,
      });
      toast.success(dir === 'rtl' ? 'تم حفظ وسائط الرئيسية' : 'Hero media saved');
    } catch (error) {
      toast.error(extractApiError(error, dir === 'rtl' ? 'تعذر حفظ وسائط الرئيسية' : 'Unable to save hero media').message);
    }
  };

  return (
    <div className="space-y-6" dir={dir}>
      {settingsLoading && (
        <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs" role="status">
          {dir === 'rtl' ? 'جارٍ تحميل إعدادات الموقع من الخادم...' : 'Loading website settings from the server...'}
        </div>
      )}
      {settingsError && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm" role="alert">
          <span>{settingsError}</span>
          <button type="button" onClick={() => void refreshSettings()} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold">
            {dir === 'rtl' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}
      {!canManageSettings && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
          {dir === 'rtl'
            ? 'وضع العرض فقط: لا تملك صلاحية تعديل الإعدادات.'
            : 'Read-only access: You have view permissions only for site settings.'}
        </div>
      )}
      <div className="bg-slate-900/60 border border-sky-500/30 dark:border-sky-900/50 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-widest">
          {dir === 'rtl' ? 'شعار الموقع (Logo)' : 'Site Logo'}
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-300">
              {dir === 'rtl' ? 'الشعار الافتراضي' : 'Default Logo'}
            </h4>
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="flex-shrink-0">
                {tempLogoPreview || settings.appearance.logo_url ? (
                  <div className="relative group">
                    <img
                      src={tempLogoPreview || settings.appearance.logo_url}
                      alt="Logo Preview"
                      className="h-20 w-auto object-contain bg-slate-800 p-2 rounded-xl border border-slate-700"
                    />
                    {canManageSettings && (
                      <button
                        type="button"
                        onClick={() => {
                          void persistSettings(
                            { appearance: { ...settings.appearance, logo_url: '' } },
                            dir === 'rtl' ? 'تم حذف الشعار' : 'Logo removed'
                          );
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="h-20 w-20 flex items-center justify-center bg-slate-800 rounded-xl border border-dashed border-slate-600">
                    <ImageIcon className="w-8 h-8 text-slate-400" />
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3">
                {canManageSettings && (
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center px-4 py-2 bg-sky-500/10 text-sky-400 rounded-lg cursor-pointer hover:bg-sky-500/20 font-medium text-sm border border-sky-500/30">
                      <Upload className="w-4 h-4 me-2" />
                      {dir === 'rtl' ? 'رفع صورة' : 'Upload Image'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowLogoUrlInput(!showLogoUrlInput)}
                      className="flex items-center px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 font-medium text-sm border border-slate-700"
                    >
                      <LinkIcon className="w-4 h-4 me-2" />
                      {dir === 'rtl' ? 'رابط مباشر' : 'Image URL'}
                    </button>
                  </div>
                )}

                {showLogoUrlInput && (
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={logoUrlInput}
                      onChange={(e) => setLogoUrlInput(e.target.value)}
                      placeholder="https://example.com/logo.png"
                      className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!isPermanentFileReference(logoUrlInput)) {
                          toast.error(dir === 'rtl' ? 'رابط غير صالح' : 'Invalid URL');
                          return;
                        }
                        const saved = await persistSettings(
                          { appearance: { ...settings.appearance, logo_url: logoUrlInput.trim() } },
                          dir === 'rtl' ? 'تم تطبيق الشعار' : 'Logo applied'
                        );
                        if (saved) {
                          setLogoUrlInput('');
                          setShowLogoUrlInput(false);
                        }
                      }}
                      className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm rounded-lg"
                    >
                      {dir === 'rtl' ? 'تطبيق' : 'Apply'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-300">
              {dir === 'rtl' ? 'الشعار الداكن / للنافبار' : 'Dark Mode / Navbar Logo'}
            </h4>
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="flex-shrink-0">
                {tempDarkLogoPreview || settings.appearance.logo_dark_url ? (
                  <div className="relative group">
                    <img
                      src={tempDarkLogoPreview || settings.appearance.logo_dark_url}
                      alt="Dark Logo Preview"
                      className="h-20 w-auto object-contain bg-slate-900 p-2 rounded-xl border border-slate-700"
                    />
                    {canManageSettings && (
                      <button
                        type="button"
                        onClick={() => {
                          void persistSettings(
                            { appearance: { ...settings.appearance, logo_dark_url: '' } },
                            dir === 'rtl' ? 'تم حذف الشعار الداكن' : 'Dark logo removed'
                          );
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="h-20 w-20 flex items-center justify-center bg-slate-900 rounded-xl border border-dashed border-slate-600">
                    <ImageIcon className="w-8 h-8 text-slate-600" />
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3">
                {canManageSettings && (
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center px-4 py-2 bg-sky-500/10 text-sky-400 rounded-lg cursor-pointer hover:bg-sky-500/20 font-medium text-sm border border-sky-500/30">
                      <Upload className="w-4 h-4 me-2" />
                      {dir === 'rtl' ? 'رفع صورة' : 'Upload Image'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleDarkLogoUpload}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowDarkLogoUrlInput(!showDarkLogoUrlInput)}
                      className="flex items-center px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 font-medium text-sm border border-slate-700"
                    >
                      <LinkIcon className="w-4 h-4 me-2" />
                      {dir === 'rtl' ? 'رابط مباشر' : 'Image URL'}
                    </button>
                  </div>
                )}

                {showDarkLogoUrlInput && (
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={darkLogoUrlInput}
                      onChange={(e) => setDarkLogoUrlInput(e.target.value)}
                      placeholder="https://example.com/logo-dark.png"
                      className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!isPermanentFileReference(darkLogoUrlInput)) {
                          toast.error(dir === 'rtl' ? 'رابط غير صالح' : 'Invalid URL');
                          return;
                        }
                        const saved = await persistSettings(
                          { appearance: { ...settings.appearance, logo_dark_url: darkLogoUrlInput.trim() } },
                          dir === 'rtl' ? 'تم تطبيق الشعار' : 'Logo applied'
                        );
                        if (saved) {
                          setDarkLogoUrlInput('');
                          setShowDarkLogoUrlInput(false);
                        }
                      }}
                      className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm rounded-lg"
                    >
                      {dir === 'rtl' ? 'تطبيق' : 'Apply'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-800">
          <label className="block text-sm font-bold text-slate-300 mb-2">
            {dir === 'rtl' ? 'طريقة العرض' : 'Display Mode'}
          </label>
          <select
            disabled={!canManageSettings}
            value={settings.appearance.logo_display}
            onChange={(e) => {
              void persistSettings(
                {
                  appearance: {
                    ...settings.appearance,
                    logo_display: e.target.value as LogoDisplayMode,
                  },
                },
                dir === 'rtl' ? 'تم تحديث طريقة عرض الشعار' : 'Logo display mode updated'
              );
            }}
            className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            <option value="logo_only">{dir === 'rtl' ? 'شعار فقط' : 'Logo Only'}</option>
            <option value="logo_and_text">{dir === 'rtl' ? 'شعار مع نص' : 'Logo and Text'}</option>
            <option value="text_only">{dir === 'rtl' ? 'نص فقط' : 'Text Only'}</option>
            <option value="hidden">{dir === 'rtl' ? 'إخفاء' : 'Hidden'}</option>
          </select>
        </div>
      </div>

      <form onSubmit={handleSaveHeroMedia} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-bold text-white uppercase tracking-widest">
          {dir === 'rtl' ? 'وسائط القسم الرئيسي (Hero Media)' : 'Hero Section Media'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2">
              {dir === 'rtl' ? 'النوع النشط' : 'Active Type'}
            </label>
            <select
              disabled={!canManageSettings}
              value={activeMediaType}
              onChange={(e) => setActiveMediaType(e.target.value as 'image' | 'video' | 'animation')}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              <option value="image">{dir === 'rtl' ? 'صورة' : 'Image'}</option>
              <option value="video">{dir === 'rtl' ? 'فيديو' : 'Video'}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2">
              {dir === 'rtl' ? 'رابط الصورة' : 'Image URL'}
            </label>
            <input
              disabled={!canManageSettings}
              type="url"
              value={heroImageUrl}
              onChange={(e) => setHeroImageUrl(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2">
              {dir === 'rtl' ? 'رابط الفيديو' : 'Video URL'}
            </label>
            <input
              disabled={!canManageSettings}
              type="url"
              value={heroVideoUrl}
              onChange={(e) => setHeroVideoUrl(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>
        </div>
        {canManageSettings && (
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{dir === 'rtl' ? 'حفظ الوسائط' : 'Save Hero Media'}</span>
          </button>
        )}
      </form>
    </div>
  );
}
