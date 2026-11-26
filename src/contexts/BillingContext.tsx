import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, extractApiError } from '../lib/apiClient';
import { useAuth } from './AuthContext';
import {
  CreateInvoicePayload,
  InvoicePaymentRecord,
  InvoiceRecord,
  RecordInvoicePaymentPayload,
  UpdateInvoicePayload,
  sanitizePaymentPayload,
} from '../types/billing';

export interface BillingContextValue {
  invoices: InvoiceRecord[];
  loading: boolean;
  error: string | null;
  fetchInvoices: () => Promise<void>;
  getInvoice: (invoiceId: number) => Promise<InvoiceRecord>;
  createInvoice: (payload: CreateInvoicePayload) => Promise<InvoiceRecord>;
  updateDraftInvoice: (invoiceId: number, payload: UpdateInvoicePayload) => Promise<InvoiceRecord>;
  issueInvoice: (invoiceId: number) => Promise<InvoiceRecord>;
  updateInvoiceStatus: (
    invoiceId: number,
    status: 'issued' | 'overdue' | 'cancelled'
  ) => Promise<InvoiceRecord>;
  recordPayment: (
    invoiceId: number,
    payload: RecordInvoicePaymentPayload
  ) => Promise<InvoiceRecord>;
  fetchPaymentHistory: (invoiceId: number) => Promise<InvoicePaymentRecord[]>;
  deleteDraftInvoice: (invoiceId: number) => Promise<void>;
  downloadInvoicePdf: (invoiceId: number, invoiceNumber?: string) => Promise<void>;
}

const BillingContext = createContext<BillingContextValue | undefined>(undefined);

function sanitizeFilenameSegment(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64) || 'invoice';
}

export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, hasPermission } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canViewAdminBilling =
    user !== null &&
    (user.role === 'super_admin' ||
      (user.role === 'custom_admin' &&
        (hasPermission('view_billing') || hasPermission('manage_billing'))));

  const isClientUser = user !== null && user.role === 'client';

  const upsertInvoice = useCallback((incoming: InvoiceRecord) => {
    setInvoices((prev) => {
      const exists = prev.some((inv) => inv.id === incoming.id);
      if (!exists) return [incoming, ...prev];
      return prev.map((inv) => (inv.id === incoming.id ? incoming : inv));
    });
    return incoming;
  }, []);

  const fetchInvoices = useCallback(async () => {
    if (!user || (!canViewAdminBilling && !isClientUser)) {
      setInvoices([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Clear the previous account's invoices before loading the current session's records.
    // This prevents stale billing data from remaining visible after an account switch.
    setInvoices([]);
    setLoading(true);
    setError(null);
    try {
      const endpoint = isClientUser ? '/api/client/invoices' : '/api/invoices';
      const res = await apiClient.get(endpoint);
      const list = Array.isArray(res.data?.data) ? (res.data.data as InvoiceRecord[]) : [];
      setInvoices(isClientUser ? list.filter((inv) => inv.status !== 'draft') : list);
    } catch (err) {
      setInvoices([]);
      const info = extractApiError(err, 'Unable to load invoices from server.');
      setError(info.message);
    } finally {
      setLoading(false);
    }
  }, [user, canViewAdminBilling, isClientUser]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const getInvoice = async (invoiceId: number): Promise<InvoiceRecord> => {
    const endpoint = isClientUser ? `/api/client/invoices/${invoiceId}` : `/api/invoices/${invoiceId}`;
    const res = await apiClient.get(endpoint);
    return upsertInvoice(res.data.data);
  };

  const createInvoice = async (payload: CreateInvoicePayload): Promise<InvoiceRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.post('/api/invoices', payload);
    return upsertInvoice(res.data.data);
  };

  const updateDraftInvoice = async (
    invoiceId: number,
    payload: UpdateInvoicePayload
  ): Promise<InvoiceRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.put(`/api/invoices/${invoiceId}`, payload);
    return upsertInvoice(res.data.data);
  };

  const issueInvoice = async (invoiceId: number): Promise<InvoiceRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.post(`/api/invoices/${invoiceId}/issue`);
    return upsertInvoice(res.data.data);
  };

  const updateInvoiceStatus = async (
    invoiceId: number,
    status: 'issued' | 'overdue' | 'cancelled'
  ): Promise<InvoiceRecord> => {
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.put(`/api/invoices/${invoiceId}/status`, { status });
    return upsertInvoice(res.data.data);
  };

  const recordPayment = async (
    invoiceId: number,
    payload: RecordInvoicePaymentPayload
  ): Promise<InvoiceRecord> => {
    const cleanPayload = sanitizePaymentPayload(payload as unknown as Record<string, unknown>);
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.post(`/api/invoices/${invoiceId}/payments`, cleanPayload);
    return upsertInvoice(res.data.data);
  };

  const fetchPaymentHistory = async (invoiceId: number): Promise<InvoicePaymentRecord[]> => {
    const endpoint = isClientUser
      ? `/api/client/invoices/${invoiceId}/payments`
      : `/api/invoices/${invoiceId}/payments`;
    const res = await apiClient.get(endpoint);
    return Array.isArray(res.data?.data) ? (res.data.data as InvoicePaymentRecord[]) : [];
  };

  const deleteDraftInvoice = async (invoiceId: number): Promise<void> => {
    await apiClient.get('/sanctum/csrf-cookie');
    await apiClient.delete(`/api/invoices/${invoiceId}`);
    setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId));
  };

  const downloadInvoicePdf = async (
    invoiceId: number,
    invoiceNumber?: string
  ): Promise<void> => {
    const endpoint = isClientUser
      ? `/api/client/invoices/${invoiceId}/pdf`
      : `/api/invoices/${invoiceId}/pdf`;

    const response = await apiClient.get(endpoint, {
      responseType: 'blob',
    });

    const blob =
      response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'application/pdf' });

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${sanitizeFilenameSegment(invoiceNumber || `invoice-${invoiceId}`)}.pdf`;
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <BillingContext.Provider
      value={{
        invoices,
        loading,
        error,
        fetchInvoices,
        getInvoice,
        createInvoice,
        updateDraftInvoice,
        issueInvoice,
        updateInvoiceStatus,
        recordPayment,
        fetchPaymentHistory,
        deleteDraftInvoice,
        downloadInvoicePdf,
      }}
    >
      {children}
    </BillingContext.Provider>
  );
};

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) {
    throw new Error('useBilling must be used within a BillingProvider');
  }
  return ctx;
}
