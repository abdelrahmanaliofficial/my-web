import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2, Sparkles, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient, extractApiError } from '../../lib/apiClient';

interface Booking {
  id: number;
  name: string;
  phone: string;
  businessType: string;
  plan: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  created_at: string;
}

const BookingsPage: React.FC = () => {
  const { language, dir } = useLanguage();
  const { hasPermission } = useAuth();

  const canManageLeads = hasPermission('manage_leads') || hasPermission('update_leads');
  const canDeleteLeads = hasPermission('manage_leads') || hasPermission('delete_leads');

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [suggestedReply, setSuggestedReply] = useState('');
  const [loadingReply, setLoadingReply] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/api/bookings')
      .then((res) => {
        if (Array.isArray(res.data?.data)) {
          setBookings(res.data.data);
        }
      })
      .catch((err) => {
        const info = extractApiError(err, 'Unable to load bookings from server.');
        setServerError(info.message);
      });
  }, []);

  const handleStatusChange = async (id: number, status: Booking['status']) => {
    if (!canManageLeads) return;
    try {
      await apiClient.put(`/api/bookings/${id}/status`, { status });
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
      toast.success(language === 'ar' ? 'تم تحديث الحالة' : 'Status updated');
    } catch (err) {
      const info = extractApiError(err, 'Failed to update status.');
      toast.error(info.message);
    }
  };

  const handleDeleteBooking = async (id: number) => {
    if (!canDeleteLeads) return;
    try {
      await apiClient.delete(`/api/bookings/${id}`);
      setBookings((prev) => prev.filter((b) => b.id !== id));
      toast.success(language === 'ar' ? 'تم حذف الحجز' : 'Booking deleted');
    } catch (err) {
      const info = extractApiError(err, 'Failed to delete booking.');
      toast.error(info.message);
    }
  };

  const handleSuggestReply = async (booking: Booking) => {
    setLoadingReply(true);
    try {
      const res = await apiClient.post('/api/suggest-reply', {
        messages: [
          {
            sender: booking.name,
            text: `Hi, I requested the ${booking.plan} plan for my ${booking.businessType} business. Phone: ${booking.phone}`,
          },
        ],
      });
      if (res.data?.reply) {
        setSuggestedReply(res.data.reply);
      }
    } catch (err) {
      const info = extractApiError(err, 'Failed to generate reply.');
      toast.error(info.message);
    } finally {
      setLoadingReply(false);
    }
  };

  return (
    <div className="space-y-6" dir={dir}>
      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm text-start">
          <thead className="bg-slate-900 text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="px-5 py-4 text-start">{language === 'ar' ? 'العميل' : 'Client'}</th>
              <th className="px-5 py-4 text-start">{language === 'ar' ? 'الهاتف' : 'Phone'}</th>
              <th className="px-5 py-4 text-start">{language === 'ar' ? 'المجال' : 'Business'}</th>
              <th className="px-5 py-4 text-start">{language === 'ar' ? 'الباقة' : 'Plan'}</th>
              <th className="px-5 py-4 text-start">{language === 'ar' ? 'الحالة' : 'Status'}</th>
              <th className="px-5 py-4 text-start">{language === 'ar' ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {bookings.map((booking) => (
              <tr key={booking.id} className="hover:bg-slate-900/40">
                <td className="px-5 py-4 font-bold text-white">{booking.name}</td>
                <td className="px-5 py-4 text-slate-300">{booking.phone}</td>
                <td className="px-5 py-4 text-slate-300">{booking.businessType}</td>
                <td className="px-5 py-4 text-sky-400 font-semibold">{booking.plan}</td>
                <td className="px-5 py-4">
                  <select
                    disabled={!canManageLeads}
                    value={booking.status}
                    onChange={(e) =>
                      handleStatusChange(booking.id, e.target.value as Booking['status'])
                    }
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white disabled:opacity-60"
                  >
                    <option value="pending">pending</option>
                    <option value="confirmed">confirmed</option>
                    <option value="completed">completed</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </td>
                <td className="px-5 py-4 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loadingReply}
                    onClick={() => handleSuggestReply(booking)}
                    title="Draft Reply"
                    className="p-2 rounded-lg bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                  {canDeleteLeads && (
                    <button
                      type="button"
                      onClick={() => handleDeleteBooking(booking.id)}
                      title="Delete"
                      className="p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                  {language === 'ar' ? 'لا توجد حجوزات حالياً.' : 'No bookings yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {suggestedReply && (
        <div className="bg-slate-900/80 border border-sky-500/30 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-sky-400 mb-2">
            {language === 'ar' ? 'مسودة رد مقترحة' : 'Suggested Reply Draft'}
          </h3>
          <p className="text-sm text-slate-200 whitespace-pre-wrap">{suggestedReply}</p>
        </div>
      )}
    </div>
  );
};

export default BookingsPage;
