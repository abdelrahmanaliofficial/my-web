import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, extractApiError } from '../lib/apiClient';
import { sanitizePersistedMediaUrl } from '../types/media';

export type LogoDisplayMode = 'logo_only' | 'logo_and_text' | 'text_only' | 'hidden';

export interface SiteSettings {
  appearance: {
    logo_url: string;
    logo_dark_url?: string;
    logo_display: LogoDisplayMode;
    primary_color: string;
  };
  pages: {
    show_stats: boolean;
    show_pricing: boolean;
    show_portfolio: boolean;
    show_testimonials: boolean;
  };
}

export interface HeroMediaConfig {
  active_media_type: 'image' | 'video' | 'animation';
  image_path: string;
  video_path: string;
  animation_path: string;
}

const defaultSettings: SiteSettings = {
  appearance: {
    logo_url: '',
    logo_dark_url: '',
    logo_display: 'logo_and_text',
    primary_color: '#38BDF8',
  },
  pages: {
    show_stats: false,
    show_pricing: true,
    show_portfolio: true,
    show_testimonials: false,
  },
};

const defaultHeroMedia: HeroMediaConfig = {
  active_media_type: 'image',
  image_path: '',
  video_path: '',
  animation_path: '',
};

interface SettingsContextValue {
  settings: SiteSettings;
  heroMedia: HeroMediaConfig;
  darkMode: boolean;
  loading: boolean;
  error: string | null;
  toggleDarkMode: () => void;
  refreshSettings: () => Promise<void>;
  updateSettings: (next: Partial<SiteSettings>) => Promise<void>;
  updateHeroMedia: (next: Partial<HeroMediaConfig>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

function sanitizeSiteSettings(candidate: Partial<SiteSettings> | null | undefined): SiteSettings {
  const appearance = { ...defaultSettings.appearance, ...(candidate?.appearance || {}) };
  return {
    appearance: {
      ...appearance,
      logo_url: sanitizePersistedMediaUrl(appearance.logo_url),
      logo_dark_url: sanitizePersistedMediaUrl(appearance.logo_dark_url),
    },
    pages: { ...defaultSettings.pages, ...(candidate?.pages || {}) },
  };
}

function sanitizeHeroMedia(candidate: Partial<HeroMediaConfig> | null | undefined): HeroMediaConfig {
  const activeType = candidate?.active_media_type;
  return {
    active_media_type: activeType === 'video' || activeType === 'animation' ? activeType : 'image',
    image_path: sanitizePersistedMediaUrl(candidate?.image_path),
    video_path: sanitizePersistedMediaUrl(candidate?.video_path),
    animation_path: sanitizePersistedMediaUrl(candidate?.animation_path),
  };
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [heroMedia, setHeroMedia] = useState<HeroMediaConfig>(defaultHeroMedia);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('portfolio_dark_mode') !== 'false';
    } catch {
      return true;
    }
  });

  const refreshSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsResponse, heroResponse] = await Promise.all([
        apiClient.get('/api/settings'),
        apiClient.get('/api/hero-media'),
      ]);

      const rawSettings = settingsResponse.data?.data ?? settingsResponse.data ?? {};
      setSettings(sanitizeSiteSettings(rawSettings));
      setHeroMedia(sanitizeHeroMedia(heroResponse.data?.data ?? heroResponse.data ?? {}));
    } catch (requestError) {
      const info = extractApiError(requestError, 'Unable to load website settings from the server.');
      setError(info.message);
      // Keep safe defaults for display, but never persist edits locally or claim they were saved.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('portfolio_dark_mode', String(darkMode));
    } catch {
      // Theme preference is optional and is not business data.
    }
  }, [darkMode]);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const updateSettings = async (next: Partial<SiteSettings>): Promise<void> => {
    const merged = sanitizeSiteSettings({
      appearance: { ...settings.appearance, ...(next.appearance || {}) },
      pages: { ...settings.pages, ...(next.pages || {}) },
    });

    try {
      await apiClient.get('/sanctum/csrf-cookie');
      const response = await apiClient.put('/api/settings', merged);
      const saved = response.data?.data ?? response.data;
      setSettings(sanitizeSiteSettings(saved));
      setError(null);
    } catch (requestError) {
      const info = extractApiError(requestError, 'Unable to save website settings.');
      setError(info.message);
      throw requestError;
    }
  };

  const updateHeroMedia = async (next: Partial<HeroMediaConfig>): Promise<void> => {
    const merged = sanitizeHeroMedia({ ...heroMedia, ...next });

    try {
      await apiClient.get('/sanctum/csrf-cookie');
      const response = await apiClient.post('/api/hero-media', {
        active_media_type: merged.active_media_type,
        image_url: merged.image_path,
        video_url: merged.video_path,
        animation_url: merged.animation_path,
      });
      setHeroMedia(sanitizeHeroMedia(response.data?.data ?? response.data ?? merged));
      setError(null);
    } catch (requestError) {
      const info = extractApiError(requestError, 'Unable to save homepage media.');
      setError(info.message);
      throw requestError;
    }
  };

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        heroMedia,
        darkMode,
        loading,
        error,
        toggleDarkMode,
        refreshSettings,
        updateSettings,
        updateHeroMedia,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}
