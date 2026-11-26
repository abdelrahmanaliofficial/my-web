import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  MessageSquare,
  Plus,
  Search,
  Send,
  Paperclip,
  Archive,
  RotateCcw,
  Download,
  Eye,
  CheckCheck,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';
import { apiClient, extractApiError } from '../../lib/apiClient';
import { ConversationClientSummary, ConversationProjectSummary } from '../../types/chat';
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
import FilePreviewModal from '../../components/common/FilePreviewModal';

const Messages: React.FC = () => {
  const { language, dir } = useLanguage();
  const { hasPermission } = useAuth();
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
    startConversation,
    sendMessage,
    markConversationAsRead,
    archiveConversation,
    reopenConversation,
    downloadAttachment,
  } = useChat();

  const canCreate = hasPermission('create_messages') || hasPermission('manage_messages');
  const canSend =
    hasPermission('create_messages') ||
    hasPermission('update_messages') ||
    hasPermission('manage_messages');
  const canArchive = hasPermission('update_messages') || hasPermission('manage_messages');

  const [clients, setClients] = useState<ConversationClientSummary[]>([]);
  const [availableProjects, setAvailableProjects] = useState<ConversationProjectSummary[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ConversationStatus>('open');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Start new conversation modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newClientId, setNewClientId] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newInitialMessage, setNewInitialMessage] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);

  // Reply composer
  const [replyBody, setReplyBody] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [previewFile, setPreviewFile] = useState<MediaFileMetadata | null>(null);

  const replyFileInputRef = useRef<HTMLInputElement | null>(null);
  const newFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!canCreate) {
      setClients([]);
      setAvailableProjects([]);
      return;
    }

    apiClient
      .get('/api/conversation-options')
      .then((res) => {
        const options = res.data?.data || {};
        setClients(Array.isArray(options.clients) ? options.clients : []);
        setAvailableProjects(Array.isArray(options.projects) ? options.projects : []);
      })
      .catch((err) => {
        const info = extractApiError(err, 'Unable to load clients for a new conversation.');
        toast.error(info.message);
        setClients([]);
        setAvailableProjects([]);
      });
  }, [canCreate]);

  const filteredConversations = useMemo(
    () => filterConversations(conversations, { search, status: statusFilter }),
    [conversations, search, statusFilter]
  );

  const selectedConversation: ConversationRecord | null = useMemo(() => {
    if (filteredConversations.length === 0) return null;
    return filteredConversations.find((c) => c.id === selectedId) || filteredConversations[0];
  }, [filteredConversations, selectedId]);

  useEffect(() => {
    if (!selectedConversation) return;
    loadConversationMessages(selectedConversation.id, 1, 25).catch((err) => {
      toast.error(extractApiError(err, 'Unable to load conversation messages.').message);
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

  const projectsForNewClient = useMemo(() => {
    const cid = Number(newClientId);
    if (!cid) return availableProjects;
    return availableProjects.filter((p) => p.client_id === cid);
  }, [availableProjects, newClientId]);

  const handleSelectReplyFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleSelectNewFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const check = validateMessageAttachments(files);
    if (!check.valid) {
      toast.error(check.error || 'Invalid attachment');
      e.target.value = '';
      return;
    }
    setNewFiles(files);
  };

  const handleCreateConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    const cid = Number(newClientId);
    if (!cid) {
      toast.error(language === 'ar' ? 'يرجى اختيار العميل' : 'Please select a client');
      return;
    }

    setCreating(true);
    try {
      const created = await startConversation({
        client_id: cid,
        project_id: newProjectId ? Number(newProjectId) : null,
        subject: newSubject.trim() || undefined,
        initial_message: newInitialMessage.trim() || undefined,
        attachments: newFiles,
      });
      setStatusFilter('open');
      setSelectedId(created.id);
      setCreateOpen(false);
      setNewClientId('');
      setNewProjectId('');
      setNewSubject('');
      setNewInitialMessage('');
      setNewFiles([]);
      if (newFileInputRef.current) newFileInputRef.current.value = '';
      toast.success(language === 'ar' ? 'تم بدء المحادثة بنجاح' : 'Conversation started');
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to create conversation.').message);
    } finally {
      setCreating(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !canSend) return;

    const trimmed = replyBody.trim();
    if (!trimmed && replyFiles.length === 0) {
      toast.error(
        language === 'ar'
          ? 'اكتب رسالة أو أرفق ملفاً قبل الإرسال'
          : 'Write a message or attach a file before sending'
      );
      return;
    }

    setSending(true);
    try {
      // Wait strictly for backend persistence confirmation before updating composer state
      await sendMessage(selectedConversation.id, {
        body: trimmed,
        attachments: replyFiles,
      });
      setReplyBody('');
      setReplyFiles([]);
      if (replyFileInputRef.current) replyFileInputRef.current.value = '';
    } catch (err) {
      toast.error(extractApiError(err, 'Message delivery failed. Please retry.').message);
    } finally {
      setSending(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!selectedConversation || !canArchive) return;
    setArchiving(true);
    try {
      if (selectedConversation.status === 'archived') {
        await reopenConversation(selectedConversation.id);
        toast.success(language === 'ar' ? 'تم استعادة المحادثة' : 'Conversation reopened');
      } else {
        await archiveConversation(selectedConversation.id);
        toast.success(language === 'ar' ? 'تمت أرشفة المحادثة' : 'Conversation archived');
      }
    } catch (err) {
      toast.error(extractApiError(err, 'Unable to update conversation status.').message);
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-6" dir={dir}>
      {/* Top Bar */}
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
                  ? 'بحث في المحادثات أو العملاء...'
                  : 'Search conversations, clients, projects...'
              }
              className="w-full rounded-xl bg-slate-950 border border-slate-800 ps-9 pe-3 py-2 text-sm text-white"
            />
          </div>

          <div className="inline-flex rounded-xl bg-slate-950 border border-slate-800 p-1 text-xs font-bold">
            {(['open', 'archived', 'all'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-lg capitalize cursor-pointer transition-colors ${
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

          <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs font-bold">
            {language === 'ar' ? `غير مقروءة: ${totalUnreadCount}` : `Unread: ${totalUnreadCount}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchConversations(false)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{language === 'ar' ? 'تحديث' : 'Refresh'}</span>
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'ar' ? 'محادثة جديدة' : 'New Conversation'}</span>
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

      {/* Split Panel: Conversations + Thread */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Conversation List */}
        <div className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 px-1">
            <MessageSquare className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-white">
              {language === 'ar' ? 'المحادثات' : 'Conversations'} ({filteredConversations.length})
            </h2>
          </div>

          {loading && conversations.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              {language === 'ar' ? 'جارٍ تحميل المحادثات...' : 'Loading conversations...'}
            </p>
          ) : filteredConversations.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              {language === 'ar'
                ? 'لا توجد محادثات مطابقة.'
                : 'No conversations found.'}
            </p>
          ) : (
            <div className="space-y-2 max-h-[640px] overflow-y-auto pe-1">
              {filteredConversations.map((conv) => {
                const active = selectedConversation?.id === conv.id;
                const unread = Number(conv.unread_count || 0);
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedId(conv.id)}
                    className={`w-full text-start p-3.5 rounded-xl border transition-colors cursor-pointer ${
                      active
                        ? 'bg-sky-500/10 border-sky-500/60'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-white truncate">
                        {conv.client?.full_name || `Client #${conv.client_id}`}
                      </span>
                      {unread > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-sky-500 text-slate-950 text-[10px] font-black">
                          {unread}
                        </span>
                      )}
                    </div>
                    {conv.subject && (
                      <div className="text-xs font-semibold text-sky-300 truncate">
                        {conv.subject}
                      </div>
                    )}
                    {conv.project && (
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {conv.project.project_code} • {conv.project.name}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px] text-slate-500">
                      <span className="truncate">
                        {conv.latest_message?.body ||
                          (conv.latest_message?.attachments?.length
                            ? language === 'ar'
                              ? 'مرفق ملف'
                              : 'Attachment'
                            : language === 'ar'
                            ? 'لا توجد رسائل بعد'
                            : 'No messages yet')}
                      </span>
                      {conv.status === 'archived' && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">
                          archived
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Thread Detail Panel */}
        <div className="lg:col-span-8 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col min-h-[580px] max-h-[740px]">
          {!selectedConversation ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
              {language === 'ar'
                ? 'اختر محادثة لعرض الرسائل أو ابدأ محادثة جديدة.'
                : 'Select a conversation to view messages or start a new one.'}
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-white">
                      {selectedConversation.subject ||
                        selectedConversation.client?.full_name ||
                        `Conversation #${selectedConversation.id}`}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                        selectedConversation.status === 'open'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                      }`}
                    >
                      {selectedConversation.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedConversation.client?.full_name} ({selectedConversation.client?.client_code})
                    {selectedConversation.project
                      ? ` • ${selectedConversation.project.project_code} ${selectedConversation.project.name}`
                      : ''}
                  </p>
                </div>

                {canArchive && (
                  <button
                    type="button"
                    disabled={archiving}
                    onClick={handleToggleArchive}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 hover:border-slate-500 text-xs font-bold text-slate-200 cursor-pointer disabled:opacity-60"
                  >
                    {selectedConversation.status === 'archived' ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'إعادة فتح' : 'Reopen'}</span>
                      </>
                    ) : (
                      <>
                        <Archive className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'أرشفة المحادثة' : 'Archive'}</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Message History */}
              <div className="flex-1 overflow-y-auto py-4 space-y-3 pe-1">
                {activePagination?.has_more && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      disabled={activeThreadLoading}
                      onClick={() => loadOlderMessages(selectedConversation.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/50 text-xs font-bold text-sky-400 cursor-pointer disabled:opacity-60"
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
                  <div className="py-12 text-center text-xs text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-400" />
                    <span>{language === 'ar' ? 'جارٍ تحميل الرسائل...' : 'Loading thread...'}</span>
                  </div>
                ) : activeMessages.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 py-12">
                    {language === 'ar'
                      ? 'لا توجد رسائل في هذه المحادثة بعد.'
                      : 'No messages in this conversation yet.'}
                  </p>
                ) : (
                  activeMessages.map((msg) => {
                    const isAdminMsg = msg.sender_type === 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isAdminMsg ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-3 border text-sm space-y-2 ${
                            isAdminMsg
                              ? 'bg-sky-500/15 border-sky-500/30 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400">
                            <span className="font-bold text-slate-200">
                              {msg.sender?.name || (isAdminMsg ? 'Admin' : 'Client')}
                            </span>
                            <span>{msg.created_at ? msg.created_at.slice(0, 16).replace('T', ' ') : ''}</span>
                          </div>

                          {msg.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.body}</p>}

                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              {msg.attachments.map((att) => (
                                <div
                                  key={att.file_uid}
                                  className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs"
                                >
                                  <span className="truncate text-slate-200">
                                    {att.original_filename} ({formatFileSize(att.file_size)})
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isPreviewableMimeType(att.mime_type) && (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewFile(att)}
                                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 cursor-pointer"
                                        aria-label={`Preview ${att.original_filename}`}
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        downloadAttachment(att).catch((err) =>
                                          toast.error(extractApiError(err, 'Download failed.').message)
                                        )
                                      }
                                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                      aria-label={`Download ${att.original_filename}`}
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400">
                            <CheckCheck
                              className={`w-3.5 h-3.5 ${
                                msg.read_at ? 'text-sky-400' : 'text-slate-600'
                              }`}
                            />
                            <span>
                              {msg.read_at
                                ? language === 'ar'
                                  ? 'مقروءة'
                                  : 'Read'
                                : language === 'ar'
                                ? 'مرسلة'
                                : 'Sent'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Message Composer */}
              {selectedConversation.status === 'archived' ? (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 text-center">
                  {language === 'ar'
                    ? 'هذه المحادثة مؤرشفة. أعد فتحها لإرسال رسائل جديدة.'
                    : 'This conversation is archived. Reopen it to send replies.'}
                </div>
              ) : !canSend ? (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 text-center">
                  {language === 'ar'
                    ? 'لديك صلاحية عرض فقط على المحادثات.'
                    : 'Read-only access: messaging send permissions are required to reply.'}
                </div>
              ) : (
                <form
                  onSubmit={handleSendMessage}
                  className="pt-3 border-t border-slate-800 space-y-2"
                >
                  {replyFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {replyFiles.map((f, idx) => (
                        <span
                          key={`${f.name}-${idx}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200"
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
                      ref={replyFileInputRef}
                      type="file"
                      multiple
                      onChange={handleSelectReplyFiles}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => replyFileInputRef.current?.click()}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-600 text-slate-300 cursor-pointer shrink-0"
                      aria-label="Attach private file"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>

                    <textarea
                      rows={2}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder={
                        language === 'ar'
                          ? 'اكتب رسالتك للعميل...'
                          : 'Write a message to the client...'
                      }
                      className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white resize-none"
                    />

                    <button
                      type="submit"
                      disabled={sending}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 text-xs font-bold cursor-pointer shrink-0"
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>
                        {sending
                          ? language === 'ar'
                            ? 'جارٍ الإرسال...'
                            : 'Sending...'
                          : language === 'ar'
                          ? 'إرسال'
                          : 'Send'}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {/* Start Conversation Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateConversation}
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {language === 'ar' ? 'بدء محادثة مع عميل' : 'Start Client Conversation'}
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                {language === 'ar' ? 'العميل' : 'Client'}
              </label>
              <select
                required
                value={newClientId}
                onChange={(e) => {
                  setNewClientId(e.target.value);
                  setNewProjectId('');
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
                {language === 'ar' ? 'المشروع المرتبط (اختياري)' : 'Related Project (Optional)'}
              </label>
              <select
                value={newProjectId}
                onChange={(e) => setNewProjectId(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="">
                  {language === 'ar' ? '-- محادثة عامة --' : '-- General Account Thread --'}
                </option>
                {projectsForNewClient.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_code} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                {language === 'ar' ? 'عنوان المحادثة' : 'Subject'}
              </label>
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder={
                  language === 'ar' ? 'موضوع المحادثة' : 'e.g. Architecture Review & Deliverables'
                }
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                {language === 'ar' ? 'الرسالة الأولى (اختياري)' : 'Initial Message'}
              </label>
              <textarea
                rows={3}
                value={newInitialMessage}
                onChange={(e) => setNewInitialMessage(e.target.value)}
                placeholder={
                  language === 'ar'
                    ? 'اكتب رسالتك الافتتاحية للعميل...'
                    : 'Write your opening message to the client...'
                }
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <input
                ref={newFileInputRef}
                type="file"
                multiple
                onChange={handleSelectNewFiles}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => newFileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300 cursor-pointer"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>
                  {newFiles.length > 0
                    ? `${newFiles.length} file(s) selected`
                    : language === 'ar'
                    ? 'إرفاق ملفات خاصة'
                    : 'Attach Private Files'}
                </span>
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300 cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 text-xs font-bold cursor-pointer"
              >
                {creating
                  ? language === 'ar'
                    ? 'جارٍ الإنشاء...'
                    : 'Creating...'
                  : language === 'ar'
                  ? 'بدء المحادثة'
                  : 'Start Conversation'}
              </button>
            </div>
          </form>
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

export default Messages;
