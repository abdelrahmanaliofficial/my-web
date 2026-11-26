import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Receipt, Download, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useBilling } from '../../contexts/BillingContext';
import { extractApiError } from '../../lib/apiClient';
import {
  InvoiceRecord,
  InvoiceStatus,
  formatCurrencyAmount,
  getInvoiceBalanceDue,
} from '../../types/billing';

const CLIENT_STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-800 text-slate-300 border-slate-700',
  issued: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  partially_paid: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  paid: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  overdue: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  cancelled: 'bg-zinc-800 text-zinc-400 border-zinc-700',
};

const ClientInvoicesSection: React.FC = () => {
  const { language, dir } = useLanguage();
  const { invoices, loading, error, downloadInvoicePdf } = useBilling();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const visibleInvoices = invoices.filter((inv) => inv.status !== 'draft');

  const handleDownload = async (inv: InvoiceRecord) => {
    setDownloadingId(inv.id);
    try {
      await downloadInvoicePdf(inv.id, inv.invoice_number);
    } catch (err) {
      toast.error(extractApiError(err, 'Unable to download invoice PDF.').message);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4" dir={dir}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-sky-400" />
          <h3 className="font-bold text-white">
            {language === 'ar' ? 'الفواتير والمدفوعات' : 'Invoices & Payment History'}
          </h3>
        </div>
        <span className="text-xs text-slate-400">{visibleInvoices.length}</span>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">
          {language === 'ar' ? 'جارٍ تحميل الفواتير...' : 'Loading invoices...'}
        </p>
      ) : visibleInvoices.length === 0 ? (
        <p className="text-sm text-slate-500">
          {language === 'ar'
            ? 'لا توجد فواتير صادرة لحسابك حالياً.'
            : 'No issued invoices found for your account.'}
        </p>
      ) : (
        <div className="space-y-3">
          {visibleInvoices.map((inv) => {
            const expanded = expandedId === inv.id;
            const balanceDue = getInvoiceBalanceDue(inv);
            return (
              <div
                key={inv.id}
                className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-white">
                        {inv.invoice_number}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                          CLIENT_STATUS_BADGE[inv.status] || CLIENT_STATUS_BADGE.issued
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                    {inv.project && (
                      <div className="text-xs text-sky-400 mt-0.5">{inv.project.name}</div>
                    )}
                    <div className="text-xs text-slate-400 mt-0.5">
                      {language === 'ar' ? 'تاريخ الإصدار: ' : 'Issued: '}
                      {inv.issue_date ? inv.issue_date.slice(0, 10) : '—'}
                      {inv.due_date
                        ? ` • ${language === 'ar' ? 'الاستحقاق: ' : 'Due: '}${inv.due_date.slice(0, 10)}`
                        : ''}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-end me-2">
                      <div className="text-sm font-black text-white">
                        {formatCurrencyAmount(inv.amount, inv.currency)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {language === 'ar' ? 'المتبقي: ' : 'Balance: '}
                        {formatCurrencyAmount(balanceDue, inv.currency)}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={downloadingId === inv.id}
                      onClick={() => handleDownload(inv)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 hover:bg-sky-500/20 text-sky-300 text-xs font-bold cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'PDF' : 'Download PDF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : inv.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                    >
                      {expanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                      <span>{language === 'ar' ? 'التفاصيل' : 'Details'}</span>
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="pt-3 border-t border-slate-800/80 space-y-3 text-xs">
                    {inv.description && <p className="text-slate-300">{inv.description}</p>}

                    {inv.items && inv.items.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-slate-800">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-900 text-slate-400">
                            <tr>
                              <th className="p-2 text-start">
                                {language === 'ar' ? 'البند' : 'Description'}
                              </th>
                              <th className="p-2 text-end">
                                {language === 'ar' ? 'الكمية' : 'Qty'}
                              </th>
                              <th className="p-2 text-end">
                                {language === 'ar' ? 'السعر' : 'Unit Price'}
                              </th>
                              <th className="p-2 text-end">
                                {language === 'ar' ? 'الإجمالي' : 'Total'}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70">
                            {inv.items.map((item) => (
                              <tr key={item.id}>
                                <td className="p-2 text-slate-200">{item.description}</td>
                                <td className="p-2 text-end text-slate-300">{item.quantity}</td>
                                <td className="p-2 text-end text-slate-300">
                                  {formatCurrencyAmount(item.unit_price, inv.currency)}
                                </td>
                                <td className="p-2 text-end font-bold text-white">
                                  {formatCurrencyAmount(item.line_total, inv.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div>
                      <div className="font-bold text-slate-200 mb-1.5">
                        {language === 'ar' ? 'المدفوعات المسجلة' : 'Payment Records'}
                      </div>
                      {!inv.payments || inv.payments.length === 0 ? (
                        <p className="text-slate-500">
                          {language === 'ar'
                            ? 'لا توجد دفعات مسجلة حتى الآن.'
                            : 'No payments recorded yet.'}
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {inv.payments.map((pay) => (
                            <div
                              key={pay.id}
                              className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/70 border border-slate-800"
                            >
                              <span className="font-mono text-emerald-400 font-bold">
                                {pay.payment_reference}
                              </span>
                              <span className="text-slate-400">
                                {pay.payment_method.replace('_', ' ')} • {pay.paid_at.slice(0, 10)}
                              </span>
                              <span className="font-bold text-white">
                                {formatCurrencyAmount(pay.amount, pay.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClientInvoicesSection;
