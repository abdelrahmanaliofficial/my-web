import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  MessageSquare,
  Send,
  Paperclip,
  Download,
  Eye,
  CheckCheck,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useChat } from '../../contexts/ChatContext';
import { extractApiError } from '../../lib/apiClient';
import {
  ConversationRecord,
  ConversationStatus,
  filterConversations,
  validateMessageAttachments,
} from '../../types/chat';
import {
  MediaFileMetadata,
  formatFileSize,
  isPreviewableMimeType,
} from '../../types/media';
import FilePreviewModal from '../common/FilePreviewModal';

const ClientMessagesSection: React.FC = () => {
  const { language, dir } = useLanguage();
  const {
    conversations,
    messagesByConversation,
    paginationByConversation,
    totalUnreadCount,
    loading,
    threadLoading,
    error,
    fetchConversations,
    loadConversationMessages,
    loadOlderMessages,
    refreshConversationMessages,
    sendMessage,
    markConversationAsRead,
    downloadAttachment,
  } = useChat();

  const [statusFilter, setStatusFilter] = useState<'all' | ConversationStatus>('open');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [previewFile, setPreviewFile] = useState<MediaFileMetadata | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const visibleConversations = useMemo(
    () => filterConversations(conversations, { status: statusFilter }),
    [conversations, statusFilter]
  );

  const selectedConversation: ConversationRecord | null = useMemo(() => {
    if (visibleConversations.length === 0) return null;
    return visibleConversations.find((c) => c.id === selectedId) || visibleConversations[0];
  }, [visibleConversations, selectedId]);

  useEffect(() => {
    if (!selectedConversation) return;
    loadConversationMessages(selectedConversation.id, 1, 25).catch((err) => {
      toast.error(extractApiError(err, 'Unable to load messages.').message);
    });
    if ((selectedConversation.unread_count || 0) > 0) {
      markConversationAsRead(selectedConversation.id).catch(() => undefined);
    }
  }, [selectedConversation?.id, loadConversationMessages, markConversationAsRead]);

  useEffect(() => {
    if (!selectedConversation || typeof window === 'undefined') return;

    const conversationId = selectedConversation.id;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshConversationMessages(conversationId).catch(() => undefined);
    }, 10000);

    return () => window.clearInterval(timer);
  }, [selectedConversation?.id, refreshConversationMessages]);

  const activeMessages = selectedConversation
    ? messagesByConversation[selectedConversation.id] || []
    : [];
  const activePagination = selectedConversation
    ? paginationByConversation[selectedConversation.id]
    : undefined;
  const activeThreadLoading = selectedConversation
    ? Boolean(threadLoading[selectedConversation.id])
    : false;

  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const check = validateMessageAttachments(files);
    if (!check.valid) {
      toast.error(check.error || 'Invalid attachment');
      e.target.value = '';
      return;
    }
    setReplyFiles(files);
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation) return;

    const trimmed = replyBody.trim();
    if (!trimmed && replyFiles.length === 0) {
      toast.error(
        language === 'ar'
          ? 'اكتب ردك أو أرفق ملفاً قبل الإرسال'
          : 'Write a reply or attach a file before sending'
      );
      return;
    }

    setSending(true);
    try {
      await sendMessage(selectedConversation.id, {
        body: trimmed,
        attachments: replyFiles,
      });
      setReplyBody('');
      setReplyFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      toast.error(extractApiError(err, 'Unable to send reply. Please retry.').message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4" dir={dir}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-sky-400" />
          <h3 className="font-bold text-white">
            {language === 'ar' ? 'الرسائل والمحادثات' : 'Messages & Support Threads'}
          </h3>
          {totalUnreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-sky-500 text-slate-950 text-[11px] font-black">
              {totalUnreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-950 border border-slate-800 p-1 text-xs font-bold">
            {(['open', 'archived', 'all'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-2.5 py-1 rounded-lg capitalize cursor-pointer ${
                  statusFilter === tab
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {language === 'ar'
                  ? tab === 'open'
                    ? 'نشطة'
                    : tab === 'archived'
                    ? 'مؤرشفة'
                    : 'الكل'
                  : tab}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => fetchConversations(false)}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 cursor-pointer"
            aria-label="Refresh conversations"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
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

      {loading && conversations.length === 0 ? (
        <p className="text-sm text-slate-400">
          {language === 'ar' ? 'جارٍ تحميل المحادثات...' : 'Loading conversations...'}
        </p>
      ) : visibleConversations.length === 0 ? (
        <p className="text-sm text-slate-500">
          {language === 'ar'
            ? 'لا توجد محادثات متاحة حالياً.'
            : 'No conversations available for your account yet.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 space-y-2 max-h-[420px] overflow-y-auto pe-1">
            {visibleConversations.map((conv) => {
              const active = selectedConversation?.id === conv.id;
              const unread = Number(conv.unread_count || 0);
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedId(conv.id)}
                  className={`w-full text-start p-3 rounded-xl border cursor-pointer transition-colors ${
                    active
                      ? 'bg-sky-500/10 border-sky-500/60'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white truncate">
                      {conv.subject ||
                        conv.project?.name ||
                        (language === 'ar' ? `محادثة #${conv.id}` : `Conversation #${conv.id}`)}
                    </span>
                    {unread > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-sky-500 text-slate-950 text-[10px] font-black">
                        {unread}
                      </span>
                    )}
                  </div>
                  {conv.project && (
                    <div className="text-[11px] text-sky-400 truncate mt-0.5">
                      {conv.project.name}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 truncate mt-1">
                    {conv.latest_message?.body ||
                      (conv.latest_message?.attachments?.length ? 'Attachment' : 'No messages yet')}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-8 rounded-xl bg-slate-950/60 border border-slate-800 p-4 flex flex-col min-h-[380px] max-h-[480px]">
            {selectedConversation && (
              <>
                <div className="flex-1 overflow-y-auto space-y-3 pe-1">
                  {activePagination?.has_more && (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        disabled={activeThreadLoading}
                        onClick={() => loadOlderMessages(selectedConversation.id)}
                        className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-bold text-sky-400 cursor-pointer"
                      >
                        {activeThreadLoading
                          ? language === 'ar'
                            ? 'جارٍ التحميل...'
                            : 'Loading...'
                          : language === 'ar'
                          ? 'تحميل الرسائل الأقدم'
                          : 'Load older messages'}
                      </button>
                    </div>
                  )}

                  {activeThreadLoading && activeMessages.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">
                      {language === 'ar' ? 'جارٍ تحميل الرسائل...' : 'Loading messages...'}
                    </p>
                  ) : activeMessages.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">
                      {language === 'ar' ? 'لا توجد رسائل بعد.' : 'No messages yet.'}
                    </p>
                  ) : (
                    activeMessages.map((msg) => {
                      const isOwnMsg = msg.sender_type === 'client';
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isOwnMsg ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 border text-xs space-y-1.5 ${
                              isOwnMsg
                                ? 'bg-sky-500/15 border-sky-500/30 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400">
                              <span className="font-bold text-slate-200">
                                {msg.sender?.name || (isOwnMsg ? 'You' : 'Team')}
                              </span>
                              <span>{msg.created_at ? msg.created_at.slice(0, 16).replace('T', ' ') : ''}</span>
                            </div>
                            {msg.body && <p className="whitespace-pre-wrap break-words text-xs">{msg.body}</p>}

                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="space-y-1 pt-1">
                                {msg.attachments.map((att) => (
                                  <div
                                    key={att.file_uid}
                                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px]"
                                  >
                                    <span className="truncate">
                                      {att.original_filename} ({formatFileSize(att.file_size)})
                                    </span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {isPreviewableMimeType(att.mime_type) && (
                                        <button
                                          type="button"
                                          onClick={() => setPreviewFile(att)}
                                          className="p-1 rounded bg-slate-800 text-sky-300 cursor-pointer"
                                          aria-label={`Preview ${att.original_filename}`}
                                        >
                                          <Eye className="w-3 h-3" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          downloadAttachment(att).catch((err) =>
                                            toast.error(extractApiError(err, 'Download failed.').message)
                                          )
                                        }
                                        className="p-1 rounded bg-slate-800 text-slate-200 cursor-pointer"
                                        aria-label={`Download ${att.original_filename}`}
                                      >
                                        <Download className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400">
                              <CheckCheck
                                className={`w-3 h-3 ${msg.read_at ? 'text-sky-400' : 'text-slate-600'}`}
                              />
                              <span>{msg.read_at ? 'Read' : 'Sent'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {selectedConversation.status === 'archived' ? (
                  <div className="mt-3 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 text-center">
                    {language === 'ar'
                      ? 'هذه المحادثة مؤرشفة من قبل الإدارة.'
                      : 'This conversation has been archived.'}
                  </div>
                ) : (
                  <form
                    onSubmit={handleSendReply}
                    className="mt-3 pt-3 border-t border-slate-800 space-y-2"
                  >
                    {replyFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {replyFiles.map((f, idx) => (
                          <span
                            key={`${f.name}-${idx}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-200"
                          >
                            <span>{f.name}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setReplyFiles((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-rose-400 cursor-pointer"
                              aria-label="Remove attachment"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-end gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleSelectFiles}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 cursor-pointer"
                        aria-label="Attach file"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>

                      <textarea
                        rows={2}
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder={
                          language === 'ar' ? 'اكتب ردك هنا...' : 'Write your reply...'
                        }
                        className="flex-1 rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white resize-none"
                      />

                      <button
                        type="submit"
                        disabled={sending}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 text-xs font-bold cursor-pointer"
                      >
                        {sending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>{sending ? (language === 'ar' ? 'جارٍ الإرسال...' : 'Sending...') : language === 'ar' ? 'إرسال' : 'Reply'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={async (f) => {
            try {
              await downloadAttachment(f);
            } catch (err) {
              toast.error(extractApiError(err, 'Download failed.').message);
            }
          }}
        />
      )}
    </div>
  );
};

export default ClientMessagesSection;
