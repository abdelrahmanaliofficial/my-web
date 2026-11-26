export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled';

export type InvoiceCurrency = 'USD' | 'EUR' | 'GBP' | 'SAR' | 'AED' | 'EGP';

export type PaymentMethod = 'bank_transfer' | 'wire' | 'cash' | 'check' | 'other';

export const INVOICE_STATUSES: InvoiceStatus[] = [
  'draft',
  'issued',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
];

export const INVOICE_CURRENCIES: InvoiceCurrency[] = [
  'USD',
  'EUR',
  'GBP',
  'SAR',
  'AED',
  'EGP',
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  'bank_transfer',
  'wire',
  'cash',
  'check',
  'other',
];

export interface InvoiceClientSummary {
  id: number;
  client_code: string;
  full_name: string;
  company_name?: string | null;
  email: string;
  account_status?: string;
}

export interface InvoiceProjectSummary {
  id: number;
  project_code: string;
  name: string;
  /** Omitted from client-safe invoice resources. */
  client_id?: number;
}

export interface InvoiceItemInput {
  id?: number;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface InvoiceItemRecord {
  id: number;
  invoice_id: number;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
  sort_order: number;
}

export interface InvoicePaymentRecord {
  id: number;
  invoice_id: number;
  /** Omitted from client-safe payment history responses. */
  client_id?: number;
  recorded_by?: number | null;
  recorder?: { id: number; name: string } | null;
  payment_reference: string;
  amount: number | string;
  currency: InvoiceCurrency | string;
  payment_method: PaymentMethod | string;
  paid_at: string;
  notes?: string | null;
  created_at?: string;
}

export interface InvoiceRecord {
  id: number;
  invoice_number: string;
  /** Omitted from client-safe invoice resources; present in administrative responses. */
  client_id?: number;
  project_id?: number | null;
  created_by?: number | null;
  description?: string | null;
  amount: number | string;
  paid_amount: number | string;
  balance_due: number;
  currency: InvoiceCurrency | string;
  issue_date?: string | null;
  due_date?: string | null;
  status: InvoiceStatus;
  issued_at?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  client?: InvoiceClientSummary | null;
  project?: InvoiceProjectSummary | null;
  creator?: { id: number; name: string; email?: string } | null;
  items?: InvoiceItemRecord[];
  payments?: InvoicePaymentRecord[];
}

export interface CreateInvoicePayload {
  client_id: number;
  project_id?: number | null;
  description?: string;
  currency: InvoiceCurrency;
  issue_date?: string;
  due_date?: string;
  notes?: string;
  issue_immediately?: boolean;
  amount?: number;
  items?: InvoiceItemInput[];
}

export interface UpdateInvoicePayload {
  client_id?: number;
  project_id?: number | null;
  description?: string;
  currency?: InvoiceCurrency;
  issue_date?: string;
  due_date?: string;
  notes?: string;
  amount?: number;
  items?: InvoiceItemInput[];
}

export interface RecordInvoicePaymentPayload {
  amount: number;
  payment_method: PaymentMethod;
  paid_at?: string;
  notes?: string;
}

export interface BillingCurrencyTotals {
  currency: string;
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
}

export interface BillingSummaryMetrics {
  byCurrency: BillingCurrencyTotals[];
  overdueCount: number;
  draftCount: number;
  paidCount: number;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function computeLineItemsTotal(items: Array<{ quantity: number | string; unit_price: number | string }>): number {
  let sum = 0;
  for (const item of items) {
    const qty = Number(item.quantity);
    const price = Number(item.unit_price);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) continue;
    sum += roundMoney(Math.max(0, qty) * Math.max(0, price));
  }
  return roundMoney(sum);
}

export function formatCurrencyAmount(amount: number | string, currency = 'USD'): string {
  const numeric = Number(amount);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  const code = String(currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeValue);
  } catch {
    return `${safeValue.toFixed(2)} ${code}`;
  }
}

export function getInvoiceBalanceDue(invoice: Pick<InvoiceRecord, 'amount' | 'paid_amount' | 'balance_due'>): number {
  if (typeof invoice.balance_due === 'number' && Number.isFinite(invoice.balance_due)) {
    return roundMoney(Math.max(0, invoice.balance_due));
  }
  return roundMoney(Math.max(0, Number(invoice.amount || 0) - Number(invoice.paid_amount || 0)));
}

export function filterInvoices(
  invoices: InvoiceRecord[],
  filters: { search?: string; status?: 'all' | InvoiceStatus }
): InvoiceRecord[] {
  const search = (filters.search || '').trim().toLowerCase();
  const status = filters.status || 'all';

  return invoices.filter((inv) => {
    if (status !== 'all' && inv.status !== status) {
      return false;
    }
    if (!search) {
      return true;
    }
    const fields = [
      inv.invoice_number,
      inv.description || '',
      inv.client?.full_name || '',
      inv.client?.company_name || '',
      inv.project?.name || '',
    ];
    return fields.some((f) => f.toLowerCase().includes(search));
  });
}

export function calculateBillingSummary(invoices: InvoiceRecord[]): BillingSummaryMetrics {
  const totalsByCurrency = new Map<string, BillingCurrencyTotals>();
  let overdueCount = 0;
  let draftCount = 0;
  let paidCount = 0;

  for (const invoice of invoices) {
    if (invoice.status === 'draft') {
      draftCount += 1;
      continue;
    }
    if (invoice.status === 'cancelled') {
      continue;
    }

    const currency = String(invoice.currency || 'USD').toUpperCase();
    const current = totalsByCurrency.get(currency) || {
      currency,
      totalInvoiced: 0,
      totalCollected: 0,
      outstandingBalance: 0,
    };
    const amount = roundMoney(Number(invoice.amount || 0));
    const paid = roundMoney(Number(invoice.paid_amount || 0));
    const balance = getInvoiceBalanceDue(invoice);

    current.totalInvoiced = roundMoney(current.totalInvoiced + amount);
    current.totalCollected = roundMoney(current.totalCollected + paid);
    current.outstandingBalance = roundMoney(current.outstandingBalance + balance);
    totalsByCurrency.set(currency, current);

    if (invoice.status === 'paid') paidCount += 1;
    if (invoice.status === 'overdue') overdueCount += 1;
  }

  return {
    byCurrency: Array.from(totalsByCurrency.values()).sort((a, b) => a.currency.localeCompare(b.currency)),
    overdueCount,
    draftCount,
    paidCount,
  };
}

export function formatBillingCurrencyTotals(
  totals: BillingCurrencyTotals[],
  field: 'totalInvoiced' | 'totalCollected' | 'outstandingBalance'
): string {
  if (totals.length === 0) return '—';
  return totals
    .filter((item) => item[field] !== 0)
    .map((item) => formatCurrencyAmount(item[field], item.currency))
    .join(' • ') || '—';
}

const PROHIBITED_CARD_FIELDS = [
  'card_number',
  'cardNumber',
  'card_cvv',
  'card_expiry',
  'card_expiration',
  'expiration_date',
  'security_code',
  'cvv',
  'cvc',
  'expiry',
  'expiration',
  'pan',
];

export function sanitizePaymentPayload(
  payload: Record<string, unknown>
): RecordInvoicePaymentPayload {
  for (const forbidden of PROHIBITED_CARD_FIELDS) {
    if (forbidden in payload && payload[forbidden] !== undefined && payload[forbidden] !== '') {
      throw new Error(
        'Card numbers and CVV codes are strictly prohibited. This system tracks invoices and offline/manual payments only.'
      );
    }
  }

  const method = String(payload.payment_method || 'bank_transfer') as PaymentMethod;
  const validMethod: PaymentMethod = PAYMENT_METHODS.includes(method) ? method : 'other';
  const amount = roundMoney(Number(payload.amount || 0));

  const clean: RecordInvoicePaymentPayload = {
    amount,
    payment_method: validMethod,
  };

  if (typeof payload.paid_at === 'string' && payload.paid_at.trim()) {
    clean.paid_at = payload.paid_at.trim();
  }
  if (typeof payload.notes === 'string' && payload.notes.trim()) {
    clean.notes = payload.notes.trim();
  }

  return clean;
}
