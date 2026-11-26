import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { CalendarCheck, Mail, Send } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface ContactProps {
  selectedPlan?: string;
}

const Contact: React.FC<ContactProps> = ({ selectedPlan = 'Growth Marketing' }) => {
  const { language, dir } = useLanguage();
  const [activeTab, setActiveTab] = useState<'booking' | 'message'>('booking');

  const [bookingForm, setBookingForm] = useState({
    name: '',
    phone: '',
    businessType: '',
    plan: selectedPlan,
  });

  const [messageForm, setMessageForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (selectedPlan) {
      setBookingForm((prev) => ({ ...prev, plan: selectedPlan }));
    }
  }, [selectedPlan]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post('/api/bookings', bookingForm);
      toast.success(
        language === 'ar'
          ? 'تم إرسال طلب الحجز بنجاح! سنتواصل معك قريباً.'
          : 'Booking request submitted successfully!'
      );
      setBookingForm({ name: '', phone: '', businessType: '', plan: selectedPlan });
    } catch {
      toast.error(
        language === 'ar'
          ? 'تعذر إرسال الطلب، يرجى المحاولة مرة أخرى.'
          : 'Failed to submit booking request.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post('/api/contact-messages', messageForm);
      toast.success(
        language === 'ar' ? 'تم استلام رسالتك بنجاح!' : 'Your message has been sent!'
      );
      setMessageForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      toast.error(
        language === 'ar' ? 'حدث خطأ أثناء إرسال الرسالة.' : 'Failed to send message.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="py-24 scroll-mt-20 max-w-4xl mx-auto px-4" id="contact" dir={dir}>
      <div className="text-center mb-10">
        <span className="text-sky-500 text-sm font-bold tracking-wider uppercase">
          {language === 'ar' ? 'ابدأ الآن' : 'Get In Touch'}
        </span>
        <h2 className="text-3xl md:text-4xl font-bold text-white mt-2 mb-3">
          {language === 'ar' ? 'احجز استشارة أو تواصل معي' : 'Book a Consultation or Contact Me'}
        </h2>
        <p className="text-slate-400 text-sm md:text-base">
          {language === 'ar'
            ? 'اختر طريقة التواصل المناسبة وسأرد عليك خلال 24 ساعة.'
            : 'Choose how you would like to connect and I will get back to you within 24 hours.'}
        </p>
      </div>

      <div className="glass-card rounded-3xl p-6 md:p-10">
        <div className="flex gap-3 mb-8 p-1.5 bg-slate-950/70 rounded-2xl border border-slate-800 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setActiveTab('booking')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'booking' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            <span>{language === 'ar' ? 'حجز باقة' : 'Book Plan'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('message')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'message' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>{language === 'ar' ? 'رسالة سريعة' : 'Direct Message'}</span>
          </button>
        </div>

        {activeTab === 'booking' ? (
          <form onSubmit={handleBookingSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  {language === 'ar' ? 'الاسم الكامل' : 'Full Name'}
                </label>
                <input
                  required
                  type="text"
                  value={bookingForm.name}
                  onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })}
                  placeholder={language === 'ar' ? 'مثال: أحمد حسن' : 'e.g. Ahmed Hassan'}
                  className="w-full rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  {language === 'ar' ? 'رقم الهاتف / واتساب' : 'Phone / WhatsApp'}
                </label>
                <input
                  required
                  type="tel"
                  value={bookingForm.phone}
                  onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })}
                  placeholder="+20 100 000 0000"
                  className="w-full rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  {language === 'ar' ? 'مجال العمل' : 'Business Type'}
                </label>
                <input
                  required
                  type="text"
                  value={bookingForm.businessType}
                  onChange={(e) => setBookingForm({ ...bookingForm, businessType: e.target.value })}
                  placeholder={language === 'ar' ? 'تجارة إلكترونية، SaaS، خدمات...' : 'E-Commerce, SaaS, Agency...'}
                  className="w-full rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  {language === 'ar' ? 'الباقة المطلوبة' : 'Selected Plan'}
                </label>
                <select
                  value={bookingForm.plan}
                  onChange={(e) => setBookingForm({ ...bookingForm, plan: e.target.value })}
                  className="w-full rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="Starter Audit">{language === 'ar' ? 'باقة الانطلاق ($450)' : 'Starter Audit ($450)'}</option>
                  <option value="Growth Marketing">{language === 'ar' ? 'باقة النمو المتكامل ($1,200/شهر)' : 'Growth Marketing ($1,200/mo)'}</option>
                  <option value="Enterprise Strategy">{language === 'ar' ? 'الباقة الاستراتيجية ($2,500/شهر)' : 'Enterprise Strategy ($2,500/mo)'}</option>
                </select>
              </div>
            </div>

            <button
              disabled={submitting}
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-sm transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? (language === 'ar' ? 'جارٍ الإرسال...' : 'Sending...') : language === 'ar' ? 'إرسال طلب الحجز' : 'Submit Booking Request'}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleMessageSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  {language === 'ar' ? 'الاسم' : 'Name'}
                </label>
                <input
                  required
                  type="text"
                  value={messageForm.name}
                  onChange={(e) => setMessageForm({ ...messageForm, name: e.target.value })}
                  className="w-full rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  {language === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                </label>
                <input
                  required
                  type="email"
                  value={messageForm.email}
                  onChange={(e) => setMessageForm({ ...messageForm, email: e.target.value })}
                  className="w-full rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                {language === 'ar' ? 'الموضوع' : 'Subject'}
              </label>
              <input
                type="text"
                value={messageForm.subject}
                onChange={(e) => setMessageForm({ ...messageForm, subject: e.target.value })}
                className="w-full rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                {language === 'ar' ? 'الرسالة' : 'Message'}
              </label>
              <textarea
                required
                rows={4}
                value={messageForm.message}
                onChange={(e) => setMessageForm({ ...messageForm, message: e.target.value })}
                className="w-full rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <button
              disabled={submitting}
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-sm transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? (language === 'ar' ? 'جارٍ الإرسال...' : 'Sending...') : language === 'ar' ? 'إرسال الرسالة' : 'Send Message'}</span>
            </button>
          </form>
        )}
      </div>
    </section>
  );
};

export default Contact;
