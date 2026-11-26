import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Receipt,
  Plus,
  Search,
  Download,
  Send,
  CreditCard,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  X,
  FileEdit,
  Ban,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useBilling } from '../../contexts/BillingContext';
import { apiClient, extractApiError } from '../../lib/apiClient';
import { ClientRecord } from '../../types/client';
import {
  INVOICE_CURRENCIES,
  INVOICE_STATUSES,
  InvoiceCurrency,
  InvoiceItemInput,
  InvoiceRecord,
  InvoiceProjectSummary,
  InvoiceStatus,
  PAYMENT_METHODS,
  PaymentMethod,
  calculateBillingSummary,
  computeLineItemsTotal,
  filterInvoices,
  formatCurrencyAmount,
  formatBillingCurrencyTotals,
  getInvoiceBalanceDue,
} from '../../types/billing';

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-800 text-slate-300 border-slate-700',
  issued: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  partially_paid: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  paid: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  overdue: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  cancelled: 'bg-zinc-800 text-zinc-400 border-zinc-700',
};

const EMPTY_ITEM: InvoiceItemInput = { description: '', quantity: 1, unit_price: 0 };

const BillingDashboard: React.FC = () => {
  const { language, dir } = useLanguage();
  const { hasPermission } = useAuth();
  const {
    invoices,
    loading,
    error,
    fetchInvoices,
    createInvoice,
    updateDraftInvoice,
    issueInvoice,
    updateInvoiceStatus,
    recordPayment,
    deleteDraftInvoice,
    downloadInvoicePdf,
  } = useBilling();

  const canCreate = hasPermission('create_billing') || hasPermission('manage_billing');
  const canUpdate = hasPermission('update_billing') || hasPermission('manage_billing');
  const canDelete = hasPermission('delete_billing') || hasPermission('manage_billing');

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [invoiceProjects, setInvoiceProjects] = useState<InvoiceProjectSummary[]>([]);
  const [clientOptionsError, setClientOptionsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [formClientId, setFormClientId] = useState('');
  const [formProjectId, setFormProjectId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCurrency, setFormCurrency] = useState<InvoiceCurrency>('USD');
  const [formIssueDate, setFormIssueDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<InvoiceItemInput[]>([{ ...EMPTY_ITEM }]);

  // Draft editing state
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [draftProjectId, setDraftProjectId] = useState('');
  const [draftCurrency, setDraftCurrency] = useState<InvoiceCurrency>('USD');
  const [draftIssueDate, setDraftIssueDate] = useState('');
  const [draftDueDate, setDraftDueDate] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftItems, setDraftItems] = useState<InvoiceItemInput[]>([]);

  // Payment tracking form state (offline/bank methods only — never card/CVV)
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Inline confirmations (avoid window.confirm in iframe)
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | null>(null);

  useEffect(() => {
    if (!canCreate && !canUpdate) {
      setClients([]);
      setInvoiceProjects([]);
      setClientOptionsError(null);
      return;
    }

    let cancelled = false;
    setClientOptionsError(null);
    apiClient
      .get('/api/invoice-options')
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        setClients(Array.isArray(data?.clients) ? (data.clients as ClientRecord[]) : []);
        setInvoiceProjects(Array.isArray(data?.projects) ? (data.projects as InvoiceProjectSummary[]) : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setClients([]);
        setInvoiceProjects([]);
        setClientOptionsError(extractApiError(err, 'Unable to load invoice client and project options.').message);
      });

    return () => {
      cancelled = true;
    };
  }, [canCreate, canUpdate]);

  const filteredInvoices = useMemo(
    () => filterInvoices(invoices, { search, status: statusFilter }),
    [invoices, search, statusFilter]
  );

  const summary = useMemo(() => calculateBillingSummary(invoices), [invoices]);

  const selectedInvoice: InvoiceRecord | null = useMemo(() => {
    if (filteredInvoices.length === 0) return null;
    return filteredInvoices.find((i) => i.id === selectedId) || filteredInvoices[0];
  }, [filteredInvoices, selectedId]);

  useEffect(() => {
    if (!selectedInvoice) {
      setEditingDraft(false);
      setConfirmAction(null);
      return;
    }
    setConfirmAction(null);
    setEditingDraft(false);
    setDraftDescription(selectedInvoice.description || '');
    setDraftProjectId(selectedInvoice.project_id ? String(selectedInvoice.project_id) : '');
    setDraftCurrency((selectedInvoice.currency as InvoiceCurrency) || 'USD');
    setDraftIssueDate((selectedInvoice.issue_date || '').slice(0, 10));
    setDraftDueDate((selectedInvoice.due_date || '').slice(0, 10));
    setDraftNotes(selectedInvoice.notes || '');
    setDraftItems(
      selectedInvoice.items && selectedInvoice.items.length > 0
        ? selectedInvoice.items.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
          }))
        : [{ ...EMPTY_ITEM }]
    );
    const balance = getInvoiceBalanceDue(selectedInvoice);
    setPaymentAmount(balance > 0 ? String(balance) : '');
    setPaymentNotes('');
    setPaymentDate('');
  }, [selectedInvoice]);

  const projectsForCreateClient = useMemo(() => {
    const cid = Number(formClientId);
    if (!cid) return invoiceProjects;
    return invoiceProjects.filter((p) => p.client_id === cid);
  }, [invoiceProjects, formClientId]);

  const projectsForDraftClient = useMemo(() => {
    if (!selectedInvoice) return [];
    return invoiceProjects.filter((p) => p.client_id === selectedInvoice.client_id);
  }, [invoiceProjects, selectedInvoice]);

  const handleCreateInvoice = async (issueImmediately: boolean) => {
    const cid = Number(formClientId);
    if (!cid) {
      toast.error(language === 'ar' ? 'يرجى اختيار العميل' : 'Please select a client');
      return;
    }

    const cleanItems = formItems
      .map((item) => ({
        description: item.description.trim(),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      }))
      .filter((item) => item.description.length > 0);

    if (cleanItems.length === 0) {
      toast.error(
        language === 'ar' ? 'أضف بنداً واحداً على الأقل للفاتورة' : 'Add at least one line item'
      );
      return;
    }

    setBusy(true);
    try {
      const created = await createInvoice({
        client_id: cid,
        project_id: formProjectId ? Number(formProjectId) : null,
        description: formDescription.trim() || undefined,
        currency: formCurrency,
        issue_date: formIssueDate || undefined,
        due_date: formDueDate || undefined,
        notes: formNotes.trim() || undefined,
        issue_immediately: issueImmediately,
        items: cleanItems,
      });
      setSelectedId(created.id);
      setCreateOpen(false);
      setFormClientId('');
      setFormProjectId('');
      setFormDescription('');
      setFormIssueDate('');
      setFormDueDate('');
      setFormNotes('');
      setFormItems([{ ...EMPTY_ITEM }]);
      toast.success(
        issueImmediately
          ? language === 'ar'
            ? 'تم إنشاء وإصدار الفاتورة بنجاح'
            : 'Invoice created & issued'
          : language === 'ar'
          ? 'تم حفظ مسودة الفاتورة'
          : 'Invoice draft saved'
      );
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to create invoice.').message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || selectedInvoice.status !== 'draft') return;

    const cleanItems = draftItems
      .map((item) => ({
        description: item.description.trim(),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      }))
      .filter((item) => item.description.length > 0);

    if (cleanItems.length === 0) {
      toast.error(
        language === 'ar' ? 'أضف بنداً واحداً على الأقل' : 'At least one line item is required'
      );
      return;
    }

    setBusy(true);
    try {
      await updateDraftInvoice(selectedInvoice.id, {
        project_id: draftProjectId ? Number(draftProjectId) : null,
        description: draftDescription.trim() || undefined,
        currency: draftCurrency,
        issue_date: draftIssueDate || undefined,
        due_date: draftDueDate || undefined,
        notes: draftNotes.trim() || undefined,
        items: cleanItems,
      });
      setEditingDraft(false);
      toast.success(language === 'ar' ? 'تم تحديث مسودة الفاتورة' : 'Draft invoice updated');
    } catch (err) {
      toast.error(extractApiError(err, 'Unable to update draft invoice.').message);
    } finally {
      setBusy(false);
    }
  };

  const handleIssueDraft = async () => {
    if (!selectedInvoice) return;
    setBusy(true);
    try {
      await issueInvoice(selectedInvoice.id);
      toast.success(language === 'ar' ? 'تم إصدار الفاتورة بنجاح' : 'Invoice issued');
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to issue invoice.').message);
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (status: 'issued' | 'overdue' | 'cancelled') => {
    if (!selectedInvoice) return;
    setBusy(true);
    try {
      await updateInvoiceStatus(selectedInvoice.id, status);
      setConfirmAction(null);
      toast.success(language === 'ar' ? 'تم تحديث حالة الفاتورة' : 'Invoice status updated');
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to update invoice status.').message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!selectedInvoice) return;
    setBusy(true);
    try {
      await deleteDraftInvoice(selectedInvoice.id);
      setConfirmAction(null);
      setSelectedId(null);
      toast.success(language === 'ar' ? 'تم حذف الفاتورة' : 'Invoice deleted');
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to delete invoice.').message);
    } finally {
      setBusy(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    const numericAmount = Number(paymentAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error(language === 'ar' ? 'أدخل مبلغ دفعة صحيح' : 'Enter a valid payment amount');
      return;
    }

    setBusy(true);
    try {
      await recordPayment(selectedInvoice.id, {
        amount: numericAmount,
        payment_method: paymentMethod,
        paid_at: paymentDate || undefined,
        notes: paymentNotes.trim() || undefined,
      });
      toast.success(language === 'ar' ? 'تم تسجيل الدفعة بنجاح' : 'Payment recorded');
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to record payment.').message);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdf = async (inv: InvoiceRecord) => {
    try {
      await downloadInvoicePdf(inv.id, inv.invoice_number);
    } catch (err) {
      toast.error(extractApiError(err, 'Unable to download invoice PDF.').message);
    }
  };

  return (
    <div className="space-y-6" dir={dir}>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-400 font-semibold mb-1">
            {language === 'ar' ? 'إجمالي الفواتير الصادرة' : 'Total Invoiced'}
          </div>
          <div className="text-base sm:text-lg font-black text-white break-words">
            {formatBillingCurrencyTotals(summary.byCurrency, 'totalInvoiced')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'ar' ? `مسودات: ${summary.draftCount}` : `Drafts: ${summary.draftCount}`}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-400 font-semibold mb-1">
            {language === 'ar' ? 'إجمالي المبالغ المحصلة' : 'Collected'}
          </div>
          <div className="text-base sm:text-lg font-black text-emerald-400 break-words">
            {formatBillingCurrencyTotals(summary.byCurrency, 'totalCollected')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'ar' ? `مدفوعة بالكامل: ${summary.paidCount}` : `Paid in full: ${summary.paidCount}`}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-400 font-semibold mb-1">
            {language === 'ar' ? 'الرصيد المستحق' : 'Outstanding Balance'}
          </div>
          <div className="text-base sm:text-lg font-black text-sky-400 break-words">
            {formatBillingCurrencyTotals(summary.byCurrency, 'outstandingBalance')}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-400 font-semibold mb-1">
            {language === 'ar' ? 'فواتير متأخرة' : 'Overdue Invoices'}
          </div>
          <div className="text-xl font-black text-rose-400">{summary.overdueCount}</div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                language === 'ar'
                  ? 'بحث برقم الفاتورة أو العميل...'
                  : 'Search invoice #, client, project...'
              }
              className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-9 pe-3 py-2 text-sm text-white"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | InvoiceStatus)}
            className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
          >
            <option value="all">{language === 'ar' ? 'كل الحالات' : 'All Statuses'}</option>
            {INVOICE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchInvoices()}
            className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
          >
            {language === 'ar' ? 'تحديث' : 'Refresh'}
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'ar' ? 'فاتورة جديدة' : 'New Invoice'}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Split View: Invoice List + Details Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Invoice List */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-sky-400" />
              <h2 className="font-bold text-white text-sm">
                {language === 'ar' ? 'قائمة الفواتير' : 'Invoices'} ({filteredInvoices.length})
              </h2>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              {language === 'ar' ? 'جارٍ تحميل الفواتير...' : 'Loading invoices...'}
            </p>
          ) : filteredInvoices.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              {language === 'ar' ? 'لا توجد فواتير مطابقة.' : 'No invoices found.'}
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[680px] overflow-y-auto pe-1">
              {filteredInvoices.map((inv) => {
                const active = selectedInvoice?.id === inv.id;
                const balance = getInvoiceBalanceDue(inv);
                return (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => setSelectedId(inv.id)}
                    className={`w-full text-start p-3.5 rounded-xl border transition-colors cursor-pointer ${
                      active
                        ? 'bg-sky-500/10 border-sky-500/60'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-sky-400">
                        {inv.invoice_number}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                          STATUS_BADGE[inv.status] || STATUS_BADGE.draft
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white truncate">
                      {inv.client?.full_name || `Client #${inv.client_id}`}
                    </div>
                    {inv.project?.name && (
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {inv.project.name}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2 text-xs">
                      <span className="font-bold text-slate-200">
                        {formatCurrencyAmount(inv.amount, inv.currency)}
                      </span>
                      <span className="text-slate-400">
                        {language === 'ar' ? 'المتبقي: ' : 'Due: '}
                        {formatCurrencyAmount(balance, inv.currency)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Invoice Details */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
          {!selectedInvoice ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              {language === 'ar'
                ? 'اختر فاتورة لعرض التفاصيل والمدفوعات.'
                : 'Select an invoice to view details, line items, and payment history.'}
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-lg font-black text-white">
                      {selectedInvoice.invoice_number}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-md border text-xs font-bold ${
                        STATUS_BADGE[selectedInvoice.status] || STATUS_BADGE.draft
                      }`}
                    >
                      {selectedInvoice.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 mt-1">
                    {selectedInvoice.client?.full_name}
                    {selectedInvoice.client?.company_name
                      ? ` — ${selectedInvoice.client.company_name}`
                      : ''}
                  </p>
                  {selectedInvoice.project && (
                    <p className="text-xs text-sky-400 mt-0.5">
                      {selectedInvoice.project.project_code} • {selectedInvoice.project.name}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadPdf(selectedInvoice)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 hover:border-sky-500 text-xs font-bold text-slate-200 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'تحميل PDF' : 'Download PDF'}</span>
                  </button>

                  {canUpdate && selectedInvoice.status === 'draft' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingDraft((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white cursor-pointer"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span>
                          {editingDraft
                            ? language === 'ar'
                              ? 'إغلاق التعديل'
                              : 'Close Edit'
                            : language === 'ar'
                            ? 'تعديل المسودة'
                            : 'Edit Draft'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleIssueDraft}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'إصدار الفاتورة' : 'Issue Invoice'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Metadata & Amounts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[11px] text-slate-400">
                    {language === 'ar' ? 'المبلغ الإجمالي' : 'Total Amount'}
                  </div>
                  <div className="text-sm font-black text-white mt-0.5">
                    {formatCurrencyAmount(selectedInvoice.amount, selectedInvoice.currency)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[11px] text-slate-400">
                    {language === 'ar' ? 'المدفوع' : 'Paid'}
                  </div>
                  <div className="text-sm font-black text-emerald-400 mt-0.5">
                    {formatCurrencyAmount(selectedInvoice.paid_amount, selectedInvoice.currency)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[11px] text-slate-400">
                    {language === 'ar' ? 'المتبقي' : 'Balance Due'}
                  </div>
                  <div className="text-sm font-black text-sky-400 mt-0.5">
                    {formatCurrencyAmount(
                      getInvoiceBalanceDue(selectedInvoice),
                      selectedInvoice.currency
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[11px] text-slate-400">
                    {language === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
                  </div>
                  <div className="text-xs font-semibold text-slate-200 mt-1">
                    {selectedInvoice.due_date ? selectedInvoice.due_date.slice(0, 10) : '—'}
                  </div>
                </div>
              </div>

              {/* Edit Draft Form */}
              {editingDraft && selectedInvoice.status === 'draft' && canUpdate ? (
                <form
                  onSubmit={handleSaveDraft}
                  className="p-4 rounded-xl bg-slate-950/80 border border-sky-500/40 space-y-4"
                >
                  <h3 className="text-sm font-bold text-white">
                    {language === 'ar' ? 'تعديل مسودة الفاتورة' : 'Edit Draft Invoice'}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {language === 'ar' ? 'المشروع' : 'Project'}
                      </label>
                      <select
                        value={draftProjectId}
                        onChange={(e) => setDraftProjectId(e.target.value)}
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                      >
                        <option value="">{language === 'ar' ? 'بدون مشروع' : 'No project'}</option>
                        {projectsForDraftClient.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.project_code} — {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {language === 'ar' ? 'العملة' : 'Currency'}
                      </label>
                      <select
                        value={draftCurrency}
                        onChange={(e) => setDraftCurrency(e.target.value as InvoiceCurrency)}
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                      >
                        {INVOICE_CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {language === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
                      </label>
                      <input
                        type="date"
                        value={draftDueDate}
                        onChange={(e) => setDraftDueDate(e.target.value)}
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {language === 'ar' ? 'الوصف' : 'Description'}
                    </label>
                    <input
                      type="text"
                      value={draftDescription}
                      onChange={(e) => setDraftDescription(e.target.value)}
                      className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">
                        {language === 'ar' ? 'البنود' : 'Line Items'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDraftItems((prev) => [...prev, { ...EMPTY_ITEM }])}
                        className="text-xs text-sky-400 hover:text-sky-300 font-bold cursor-pointer"
                      >
                        + {language === 'ar' ? 'إضافة بند' : 'Add Item'}
                      </button>
                    </div>
                    {draftItems.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <input
                          type="text"
                          required
                          placeholder="Item description"
                          value={item.description}
                          onChange={(e) =>
                            setDraftItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, description: e.target.value } : row
                              )
                            )
                          }
                          className="col-span-6 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-white"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={item.quantity}
                          onChange={(e) =>
                            setDraftItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, quantity: Number(e.target.value) } : row
                              )
                            )
                          }
                          className="col-span-2 rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs text-white"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={item.unit_price}
                          onChange={(e) =>
                            setDraftItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, unit_price: Number(e.target.value) } : row
                              )
                            )
                          }
                          className="col-span-3 rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs text-white"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraftItems((prev) =>
                              prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev
                            )
                          }
                          className="col-span-1 text-rose-400 hover:text-rose-300 cursor-pointer flex justify-center"
                          aria-label="Remove line item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="text-end text-xs font-bold text-sky-400">
                      {language === 'ar' ? 'الإجمالي: ' : 'Total: '}
                      {formatCurrencyAmount(computeLineItemsTotal(draftItems), draftCurrency)}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingDraft(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 cursor-pointer"
                    >
                      {language === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-1.5 rounded-lg bg-sky-500 text-slate-950 text-xs font-bold cursor-pointer"
                    >
                      {language === 'ar' ? 'حفظ التعديلات' : 'Save Draft'}
                    </button>
                  </div>
                </form>
              ) : (
                /* Line Items Table */
                <div className="space-y-2">
                  {selectedInvoice.description && (
                    <p className="text-xs text-slate-300">{selectedInvoice.description}</p>
                  )}

                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-xs text-start">
                      <thead className="bg-slate-950/80 text-slate-400">
                        <tr>
                          <th className="p-2.5 text-start">
                            {language === 'ar' ? 'البند' : 'Description'}
                          </th>
                          <th className="p-2.5 text-end">{language === 'ar' ? 'الكمية' : 'Qty'}</th>
                          <th className="p-2.5 text-end">
                            {language === 'ar' ? 'السعر' : 'Unit Price'}
                          </th>
                          <th className="p-2.5 text-end">
                            {language === 'ar' ? 'الإجمالي' : 'Line Total'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {selectedInvoice.items && selectedInvoice.items.length > 0 ? (
                          selectedInvoice.items.map((item) => (
                            <tr key={item.id}>
                              <td className="p-2.5 text-slate-200">{item.description}</td>
                              <td className="p-2.5 text-end text-slate-300">{item.quantity}</td>
                              <td className="p-2.5 text-end text-slate-300">
                                {formatCurrencyAmount(item.unit_price, selectedInvoice.currency)}
                              </td>
                              <td className="p-2.5 text-end font-bold text-white">
                                {formatCurrencyAmount(item.line_total, selectedInvoice.currency)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-3 text-center text-slate-500">
                              {language === 'ar'
                                ? 'لا توجد بنود تفصيلية.'
                                : 'No itemized breakdown.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status Actions */}
              {(canUpdate || canDelete) && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-2">
                    {canUpdate &&
                      ['issued', 'partially_paid'].includes(selectedInvoice.status) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleStatusChange('overdue')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold cursor-pointer"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'تحديد كمتأخرة' : 'Mark Overdue'}</span>
                        </button>
                      )}

                    {canUpdate && selectedInvoice.status === 'overdue' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleStatusChange('issued')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-bold cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'إرجاع إلى صادرة' : 'Restore to Issued'}</span>
                      </button>
                    )}

                    {canUpdate &&
                      !['paid', 'cancelled'].includes(selectedInvoice.status) &&
                      confirmAction !== 'cancel' && (
                        <button
                          type="button"
                          onClick={() => setConfirmAction('cancel')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'إلغاء الفاتورة' : 'Cancel Invoice'}</span>
                        </button>
                      )}

                    {canDelete &&
                      ['draft', 'cancelled'].includes(selectedInvoice.status) &&
                      confirmAction !== 'delete' && (
                        <button
                          type="button"
                          onClick={() => setConfirmAction('delete')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 text-xs font-bold cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'حذف' : 'Delete'}</span>
                        </button>
                      )}
                  </div>

                  {confirmAction && (
                    <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 rounded-xl text-xs">
                      <span className="text-rose-200 font-semibold">
                        {confirmAction === 'delete'
                          ? language === 'ar'
                            ? 'تأكيد الحذف؟'
                            : 'Confirm delete?'
                          : language === 'ar'
                          ? 'تأكيد إلغاء الفاتورة؟'
                          : 'Confirm cancellation?'}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          confirmAction === 'delete'
                            ? handleDeleteDraft()
                            : handleStatusChange('cancelled')
                        }
                        className="px-2.5 py-1 rounded-lg bg-rose-500 text-white font-bold cursor-pointer"
                      >
                        {language === 'ar' ? 'نعم' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction(null)}
                        className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                      >
                        {language === 'ar' ? 'تراجع' : 'No'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Record Offline / Bank Payment Form (NO card fields or CVV) */}
              {canUpdate &&
                ['issued', 'partially_paid', 'overdue'].includes(selectedInvoice.status) &&
                getInvoiceBalanceDue(selectedInvoice) > 0 && (
                  <form
                    onSubmit={handleRecordPayment}
                    className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-sm font-bold text-white">
                        {language === 'ar'
                          ? 'تسجيل دفعة (تحويل بنكي / نقدي)'
                          : 'Record Manual / Bank Payment'}
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {language === 'ar' ? 'المبلغ' : 'Amount'} ({selectedInvoice.currency})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={getInvoiceBalanceDue(selectedInvoice)}
                          required
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {language === 'ar' ? 'طريقة الدفع' : 'Payment Method'}
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                        >
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {m.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {language === 'ar' ? 'تاريخ الدفع' : 'Payment Date'}
                        </label>
                        <input
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        placeholder={
                          language === 'ar'
                            ? 'رقم المرجع البنكي أو ملاحظات (اختياري)'
                            : 'Transfer reference or internal note (optional)'
                        }
                        className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
                      >
                        {language === 'ar' ? 'تسجيل الدفعة' : 'Record Payment'}
                      </button>
                    </div>
                  </form>
                )}

              {/* Payment History */}
              <div className="space-y-2.5">
                <h3 className="text-sm font-bold text-white">
                  {language === 'ar' ? 'سجل المدفوعات' : 'Payment History'}
                </h3>
                {!selectedInvoice.payments || selectedInvoice.payments.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {language === 'ar' ? 'لا توجد دفعات مسجلة بعد.' : 'No payments recorded yet.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedInvoice.payments.map((pay) => (
                      <div
                        key={pay.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
                      >
                        <div>
                          <div className="font-mono font-bold text-emerald-400">
                            {pay.payment_reference} •{' '}
                            {formatCurrencyAmount(pay.amount, pay.currency)}
                          </div>
                          <div className="text-slate-400 mt-0.5">
                            {pay.payment_method.replace('_', ' ')} • {pay.paid_at.slice(0, 10)}
                            {pay.recorder?.name ? ` • ${pay.recorder.name}` : ''}
                          </div>
                          {pay.notes && <div className="text-slate-300 mt-0.5">{pay.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Invoice Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {language === 'ar' ? 'إنشاء فاتورة جديدة' : 'Create Invoice'}
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {clientOptionsError && (
              <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {clientOptionsError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {language === 'ar' ? 'العميل' : 'Client'}
                </label>
                <select
                  required
                  value={formClientId}
                  onChange={(e) => {
                    setFormClientId(e.target.value);
                    setFormProjectId('');
                  }}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value="">
                    {language === 'ar' ? '-- اختر العميل --' : '-- Select Client --'}
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.client_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {language === 'ar' ? 'المشروع (اختياري)' : 'Project (Optional)'}
                </label>
                <select
                  value={formProjectId}
                  onChange={(e) => setFormProjectId(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value="">
                    {language === 'ar' ? '-- بدون مشروع --' : '-- None --'}
                  </option>
                  {projectsForCreateClient.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project_code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {language === 'ar' ? 'العملة' : 'Currency'}
                </label>
                <select
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value as InvoiceCurrency)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                >
                  {INVOICE_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    {language === 'ar' ? 'تاريخ الإصدار' : 'Issue Date'}
                  </label>
                  <input
                    type="date"
                    value={formIssueDate}
                    onChange={(e) => setFormIssueDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    {language === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
                  </label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                {language === 'ar' ? 'الوصف' : 'Description'}
              </label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={
                  language === 'ar'
                    ? 'ملخص الفاتورة أو المرحلة'
                    : 'Invoice summary or milestone scope'
                }
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">
                  {language === 'ar' ? 'بنود الفاتورة' : 'Line Items'}
                </span>
                <button
                  type="button"
                  onClick={() => setFormItems((prev) => [...prev, { ...EMPTY_ITEM }])}
                  className="text-xs text-sky-400 hover:text-sky-300 font-bold cursor-pointer"
                >
                  + {language === 'ar' ? 'إضافة بند' : 'Add Line Item'}
                </button>
              </div>

              {formItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    placeholder={language === 'ar' ? 'وصف البند' : 'Description'}
                    value={item.description}
                    onChange={(e) =>
                      setFormItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, description: e.target.value } : row
                        )
                      )
                    }
                    className="col-span-6 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={item.quantity}
                    onChange={(e) =>
                      setFormItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, quantity: Number(e.target.value) } : row
                        )
                      )
                    }
                    className="col-span-2 rounded-xl bg-slate-950 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unit_price}
                    onChange={(e) =>
                      setFormItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, unit_price: Number(e.target.value) } : row
                        )
                      )
                    }
                    className="col-span-3 rounded-xl bg-slate-950 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setFormItems((prev) =>
                        prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev
                      )
                    }
                    className="col-span-1 text-rose-400 hover:text-rose-300 cursor-pointer flex justify-center"
                    aria-label="Remove item"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <div className="text-end text-sm font-black text-sky-400 pt-1">
                {language === 'ar' ? 'الإجمالي: ' : 'Total: '}
                {formatCurrencyAmount(computeLineItemsTotal(formItems), formCurrency)}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                {language === 'ar' ? 'ملاحظات الدفع (اختياري)' : 'Payment Instructions / Notes'}
              </label>
              <textarea
                rows={2}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300 cursor-pointer"
              >
                {language === 'ar' ? 'إغلاق' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={busy || Boolean(clientOptionsError) || clients.length === 0}
                onClick={() => handleCreateInvoice(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white cursor-pointer"
              >
                {language === 'ar' ? 'حفظ كمسودة' : 'Save as Draft'}
              </button>
              <button
                type="button"
                disabled={busy || Boolean(clientOptionsError) || clients.length === 0}
                onClick={() => handleCreateInvoice(true)}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer"
              >
                {language === 'ar' ? 'إصدار الفاتورة فوراً' : 'Issue Immediately'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingDashboard;
