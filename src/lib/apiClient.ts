import axios, { AxiosError, AxiosInstance } from 'axios';

export interface ApiErrorInfo {
  status: number;
  message: string;
  errors?: Record<string, string[]>;
}

type UnauthorizedHandler = (info: ApiErrorInfo) => void;
type ForbiddenHandler = (info: ApiErrorInfo) => void;

let onUnauthorizedHandler: UnauthorizedHandler | null = null;
let onForbiddenHandler: ForbiddenHandler | null = null;

export function registerAuthErrorHandlers(handlers: {
  onUnauthorized?: UnauthorizedHandler;
  onForbidden?: ForbiddenHandler;
}) {
  onUnauthorizedHandler = handlers.onUnauthorized || null;
  onForbiddenHandler = handlers.onForbidden || null;
}

export function extractApiError(error: unknown, fallbackMessage = 'Request failed.'): ApiErrorInfo {
  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<{
      message?: string;
      error?: string;
      errors?: Record<string, string[]>;
    }>;
    const status = axiosErr.response?.status || 0;
    const data = axiosErr.response?.data;
    const firstFieldError = data?.errors
      ? Object.values(data.errors).flat()[0]
      : undefined;
    const message =
      firstFieldError ||
      data?.message ||
      data?.error ||
      axiosErr.message ||
      fallbackMessage;

    return {
      status,
      message,
      errors: data?.errors,
    };
  }

  return {
    status: 0,
    message: error instanceof Error ? error.message : fallbackMessage,
  };
}

export function createApiClient(
  baseURL = (import.meta as { env?: Record<string, string | undefined> })?.env?.VITE_API_URL || ''
): AxiosInstance {
  const client = axios.create({
    baseURL,
    withCredentials: true,
    withXSRFToken: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const info = extractApiError(error);
      if (info.status === 401 && onUnauthorizedHandler) {
        onUnauthorizedHandler(info);
      } else if (info.status === 403 && onForbiddenHandler) {
        onForbiddenHandler(info);
      }
      return Promise.reject(error);
    }
  );

  return client;
}

export const apiClient = createApiClient();
