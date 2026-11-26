import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { apiClient, extractApiError } from '../lib/apiClient';
import { mediaService } from '../services/mediaService';
import { MediaFileMetadata } from '../types/media';
import { useAuth } from './AuthContext';
import {
  ConversationRecord,
  CreateConversationPayload,
  MessagePaginationMeta,
  MessageRecord,
  SendMessagePayload,
  appendPersistedMessage,
  calculateTotalUnreadCount,
  mergePaginatedMessages,
  validateMessageAttachments,
} from '../types/chat';

export interface ChatContextValue {
  conversations: ConversationRecord[];
  messagesByConversation: Record<number, MessageRecord[]>;
  paginationByConversation: Record<number, MessagePaginationMeta>;
  totalUnreadCount: number;
  loading: boolean;
  threadLoading: Record<number, boolean>;
  error: string | null;
  fetchConversations: (silent?: boolean) => Promise<void>;
  loadConversationMessages: (
    conversationId: number,
    page?: number,
    perPage?: number,
    mergeLatest?: boolean
  ) => Promise<MessageRecord[]>;
  loadOlderMessages: (conversationId: number) => Promise<MessageRecord[]>;
  refreshConversationMessages: (conversationId: number) => Promise<MessageRecord[]>;
  startConversation: (payload: CreateConversationPayload) => Promise<ConversationRecord>;
  sendMessage: (
    conversationId: number,
    payload: SendMessagePayload
  ) => Promise<MessageRecord>;
  markConversationAsRead: (conversationId: number) => Promise<void>;
  archiveConversation: (conversationId: number) => Promise<ConversationRecord>;
  reopenConversation: (conversationId: number) => Promise<ConversationRecord>;
  downloadAttachment: (attachment: MediaFileMetadata) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

const POLL_INTERVAL_MS = 10000;

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, hasPermission } = useAuth();
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<number, MessageRecord[]>
  >({});
  const [paginationByConversation, setPaginationByConversation] = useState<
    Record<number, MessagePaginationMeta>
  >({});
  const [totalUnreadCount, setTotalUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [threadLoading, setThreadLoading] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const pollingRef = useRef<boolean>(false);
  const threadPollingRef = useRef<Set<number>>(new Set());
  const sessionUserIdRef = useRef<number | null>(user?.id ?? null);

  // Do not let a previous account's cached conversations remain visible after
  // logout/account switching, or let a late response repopulate that cache.
  useEffect(() => {
    const nextUserId = user?.id ?? null;
    if (sessionUserIdRef.current !== nextUserId) {
      sessionUserIdRef.current = nextUserId;
      setConversations([]);
      setMessagesByConversation({});
      setPaginationByConversation({});
      setTotalUnreadCount(0);
      setError(null);
    }
  }, [user?.id]);

  const canViewAdminMessages =
    user !== null &&
    (user.role === 'super_admin' ||
      (user.role === 'custom_admin' &&
        (hasPermission('view_messages') || hasPermission('manage_messages'))));

  const isClientUser = user !== null && user.role === 'client';

  const getBasePath = useCallback(() => {
    return isClientUser ? '/api/client/conversations' : '/api/conversations';
  }, [isClientUser]);

  const fetchConversations = useCallback(
    async (silent = false) => {
      if (!user || (!canViewAdminMessages && !isClientUser)) {
        setConversations([]);
        setMessagesByConversation({});
        setPaginationByConversation({});
        setTotalUnreadCount(0);
        return;
      }

      if (!silent) {
        setLoading(true);
      }
      if (!silent) {
        setError(null);
      }

      try {
        const requestedUserId = user.id;
        const res = await apiClient.get(getBasePath());
        if (sessionUserIdRef.current !== requestedUserId) return;
        const list = Array.isArray(res.data?.data)
          ? (res.data.data as ConversationRecord[])
          : [];
        setConversations(list);

        const serverUnread = res.data?.meta?.total_unread_count;
        setTotalUnreadCount(
          typeof serverUnread === 'number'
            ? serverUnread
            : calculateTotalUnreadCount(list)
        );
      } catch (err) {
        if (sessionUserIdRef.current === user.id && !silent) {
          const info = extractApiError(err, 'Unable to load conversations from server.');
          setError(info.message);
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [user, canViewAdminMessages, isClientUser, getBasePath]
  );

  useEffect(() => {
    fetchConversations(false);
  }, [fetchConversations]);

  // Safe background polling for unread counts & conversation updates without external real-time deps
  useEffect(() => {
    if (typeof window === 'undefined' || !user || (!canViewAdminMessages && !isClientUser)) {
      return;
    }

    const timer = window.setInterval(async () => {
      if (pollingRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      pollingRef.current = true;
      try {
        await fetchConversations(true);
      } finally {
        pollingRef.current = false;
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [user, canViewAdminMessages, isClientUser, fetchConversations]);

  const loadConversationMessages = useCallback(
    async (
      conversationId: number,
      page = 1,
      perPage = 25,
      mergeLatest = false
    ): Promise<MessageRecord[]> => {
      if (!user) return [];
      const requestedUserId = user.id;
      setThreadLoading((prev) => ({ ...prev, [conversationId]: true }));
      try {
        const res = await apiClient.get(`${getBasePath()}/${conversationId}`, {
          params: { page, per_page: perPage },
        });
        if (sessionUserIdRef.current !== requestedUserId) return [];
        const payload = res.data?.data || {};
        const incoming: MessageRecord[] = Array.isArray(payload.messages)
          ? payload.messages
          : [];
        const conv: ConversationRecord | undefined = payload.conversation;
        const pagination: MessagePaginationMeta | undefined = payload.pagination;

        setMessagesByConversation((prev) => ({
          ...prev,
          [conversationId]: mergePaginatedMessages(
            prev[conversationId] || [],
            incoming,
            page > 1 ? 'prepend' : mergeLatest ? 'append' : 'replace'
          ),
        }));

        if (pagination) {
          setPaginationByConversation((prev) => {
            const previous = prev[conversationId];
            if (mergeLatest && previous) {
              const currentPage = Math.min(previous.current_page, pagination.last_page);
              return {
                ...prev,
                [conversationId]: {
                  ...pagination,
                  current_page: currentPage,
                  has_more: currentPage < pagination.last_page,
                },
              };
            }
            return {
              ...prev,
              [conversationId]: pagination,
            };
          });
        }

        if (conv) {
          setConversations((prev) =>
            prev.map((c) => (c.id === conv.id ? { ...c, ...conv } : c))
          );
        }

        return incoming;
      } finally {
        if (sessionUserIdRef.current === requestedUserId) {
          setThreadLoading((prev) => ({ ...prev, [conversationId]: false }));
        }
      }
    },
    [user, getBasePath]
  );

  const loadOlderMessages = useCallback(
    async (conversationId: number): Promise<MessageRecord[]> => {
      const meta = paginationByConversation[conversationId];
      if (!meta || !meta.has_more) {
        return [];
      }
      return loadConversationMessages(conversationId, meta.current_page + 1, meta.per_page);
    },
    [paginationByConversation, loadConversationMessages]
  );

  const startConversation = async (
    payload: CreateConversationPayload
  ): Promise<ConversationRecord> => {
    if (!user) throw new Error('An authenticated administrator session is required.');
    const requestedUserId = user.id;
    const files = payload.attachments || [];
    if (files.length > 0) {
      const check = validateMessageAttachments(files);
      if (!check.valid) {
        throw new Error(check.error || 'Invalid attachment.');
      }
    }

    await apiClient.get('/sanctum/csrf-cookie');

    let res;
    if (files.length > 0) {
      const formData = new FormData();
      formData.append('client_id', String(payload.client_id));
      if (payload.project_id) {
        formData.append('project_id', String(payload.project_id));
      }
      if (payload.subject) {
        formData.append('subject', payload.subject);
      }
      if (payload.initial_message) {
        formData.append('initial_message', payload.initial_message);
      }
      for (const file of files) {
        formData.append('attachments[]', file);
      }
      // Keep boundary generation under Axios/browser control for reliable multipart uploads.
      res = await apiClient.post('/api/conversations', formData);
    } else {
      res = await apiClient.post('/api/conversations', {
        client_id: payload.client_id,
        project_id: payload.project_id ?? null,
        subject: payload.subject || undefined,
        initial_message: payload.initial_message || undefined,
      });
    }

    const created: ConversationRecord = res.data.data;
    if (!created || typeof created.id !== 'number') {
      throw new Error('Server did not confirm conversation persistence.');
    }
    if (sessionUserIdRef.current !== requestedUserId) {
      throw new Error('The account changed while the conversation was being created. Refresh the original account to verify it.');
    }
    setConversations((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
    if (created.latest_message) {
      setMessagesByConversation((prev) => ({
        ...prev,
        [created.id]: [created.latest_message as MessageRecord],
      }));
    }
    return created;
  };

  // Never claim message delivery before backend confirms persistence
  const sendMessage = async (
    conversationId: number,
    payload: SendMessagePayload
  ): Promise<MessageRecord> => {
    if (!user) throw new Error('An authenticated session is required to send a message.');
    const requestedUserId = user.id;
    const trimmedBody = (payload.body || '').trim();
    const files = payload.attachments || [];

    if (!trimmedBody && files.length === 0) {
      throw new Error('Please enter a message or attach a valid file.');
    }

    if (files.length > 0) {
      const check = validateMessageAttachments(files);
      if (!check.valid) {
        throw new Error(check.error || 'Attachment validation failed.');
      }
    }

    await apiClient.get('/sanctum/csrf-cookie');

    const endpoint = `${getBasePath()}/${conversationId}/messages`;
    let res;
    if (files.length > 0) {
      const formData = new FormData();
      if (trimmedBody) {
        formData.append('body', trimmedBody);
      }
      for (const file of files) {
        formData.append('attachments[]', file);
      }
      // Keep boundary generation under Axios/browser control for reliable multipart uploads.
      res = await apiClient.post(endpoint, formData);
    } else {
      res = await apiClient.post(endpoint, { body: trimmedBody });
    }

    const persisted: MessageRecord = res.data.data;
    if (!persisted || typeof persisted.id !== 'number') {
      throw new Error('Server did not confirm message persistence.');
    }
    if (sessionUserIdRef.current !== requestedUserId) {
      throw new Error('The account changed while the message was being sent. Sign in to the original account to verify its status.');
    }

    setMessagesByConversation((prev) => ({
      ...prev,
      [conversationId]: appendPersistedMessage(prev[conversationId] || [], persisted),
    }));

    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              latest_message: persisted,
              last_message_at: persisted.created_at,
            }
          : c
      );
      return updated.sort((a, b) =>
        String(b.last_message_at || '').localeCompare(String(a.last_message_at || ''))
      );
    });

    return persisted;
  };

  const markConversationAsRead = useCallback(
    async (conversationId: number): Promise<void> => {
      if (!user) return;
      const requestedUserId = user.id;
      await apiClient.get('/sanctum/csrf-cookie');
      await apiClient.post(`${getBasePath()}/${conversationId}/read`);
      if (sessionUserIdRef.current !== requestedUserId) return;

      const targetIncomingSenderType = isClientUser ? 'admin' : 'client';
      const nowIso = new Date().toISOString();

      setMessagesByConversation((prev) => {
        const list = prev[conversationId];
        if (!list) return prev;
        return {
          ...prev,
          [conversationId]: list.map((msg) =>
            msg.sender_type === targetIncomingSenderType && !msg.read_at
              ? { ...msg, read_at: nowIso, is_read: true }
              : msg
          ),
        };
      });

      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === conversationId ? { ...c, unread_count: 0 } : c
        );
        setTotalUnreadCount(calculateTotalUnreadCount(next));
        return next;
      });
    },
    [user, getBasePath, isClientUser]
  );

  const refreshConversationMessages = useCallback(
    async (conversationId: number): Promise<MessageRecord[]> => {
      if (threadPollingRef.current.has(conversationId)) return [];
      threadPollingRef.current.add(conversationId);
      try {
        // Fetch the newest page without dropping any older pages already loaded.
        const latest = await loadConversationMessages(conversationId, 1, 25, true);
        // A thread currently open in the UI is considered read; this also marks
        // newly arrived messages during polling, not only those present on open.
        await markConversationAsRead(conversationId);
        return latest;
      } finally {
        threadPollingRef.current.delete(conversationId);
      }
    },
    [loadConversationMessages, markConversationAsRead]
  );

  const archiveConversation = async (conversationId: number): Promise<ConversationRecord> => {
    if (!user) throw new Error('An authenticated administrator session is required.');
    const requestedUserId = user.id;
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.post(`/api/conversations/${conversationId}/archive`);
    const updated: ConversationRecord = res.data.data;
    if (sessionUserIdRef.current !== requestedUserId) {
      throw new Error('The account changed while the conversation was being archived.');
    }
    setConversations((prev) => {
      const next = prev.map((c) => (c.id === conversationId ? { ...c, ...updated } : c));
      setTotalUnreadCount(calculateTotalUnreadCount(next));
      return next;
    });
    return updated;
  };

  const reopenConversation = async (conversationId: number): Promise<ConversationRecord> => {
    if (!user) throw new Error('An authenticated administrator session is required.');
    const requestedUserId = user.id;
    await apiClient.get('/sanctum/csrf-cookie');
    const res = await apiClient.post(`/api/conversations/${conversationId}/reopen`);
    const updated: ConversationRecord = res.data.data;
    if (sessionUserIdRef.current !== requestedUserId) {
      throw new Error('The account changed while the conversation was being reopened.');
    }
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, ...updated } : c))
    );
    return updated;
  };

  const downloadAttachment = async (attachment: MediaFileMetadata): Promise<void> => {
    await mediaService.downloadAuthorizedFile(attachment.file_uid, attachment.original_filename);
  };

  return (
    <ChatContext.Provider
      value={{
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
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return ctx;
}
