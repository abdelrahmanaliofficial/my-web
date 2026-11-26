import { MediaFileMetadata, validateUploadFile } from './media';

export type ConversationStatus = 'open' | 'archived';
export type MessageSenderType = 'admin' | 'client';

export interface ConversationClientSummary {
  id: number;
  client_code: string;
  full_name: string;
  company_name?: string | null;
  email: string;
  account_status?: string;
}

export interface ConversationProjectSummary {
  id: number;
  project_code: string;
  name: string;
  client_id: number;
}

export interface MessageSenderSummary {
  id?: number;
  name: string;
  role?: string;
}

export interface MessageRecord {
  id: number;
  conversation_id: number;
  sender_id?: number;
  sender_type: MessageSenderType;
  body: string | null;
  read_at: string | null;
  read_by?: number | null;
  is_read?: boolean;
  created_at: string;
  updated_at?: string;
  sender?: MessageSenderSummary | null;
  attachments?: MediaFileMetadata[];
}

export interface ConversationRecord {
  id: number;
  client_id: number;
  project_id?: number | null;
  created_by?: number | null;
  subject?: string | null;
  status: ConversationStatus;
  last_message_at?: string | null;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
  unread_count?: number;
  client?: ConversationClientSummary | null;
  project?: ConversationProjectSummary | null;
  creator?: { id: number; name: string } | null;
  latest_message?: MessageRecord | null;
}

export interface MessagePaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  has_more: boolean;
}

export interface CreateConversationPayload {
  client_id: number;
  project_id?: number | null;
  subject?: string;
  initial_message?: string;
  attachments?: File[];
}

export interface SendMessagePayload {
  body?: string;
  attachments?: File[];
}

export function calculateTotalUnreadCount(conversations: ConversationRecord[]): number {
  return conversations.reduce((sum, conv) => {
    if (conv.status !== 'open') return sum;
    return sum + Math.max(0, Number(conv.unread_count || 0));
  }, 0);
}

export function filterConversations(
  conversations: ConversationRecord[],
  filters: { search?: string; status?: 'all' | ConversationStatus }
): ConversationRecord[] {
  const search = (filters.search || '').trim().toLowerCase();
  const status = filters.status || 'all';

  return conversations.filter((conv) => {
    if (status !== 'all' && conv.status !== status) {
      return false;
    }
    if (!search) {
      return true;
    }

    const haystacks = [
      conv.subject || '',
      conv.client?.full_name || '',
      conv.client?.company_name || '',
      conv.client?.client_code || '',
      conv.project?.name || '',
      conv.latest_message?.body || '',
    ];

    return haystacks.some((val) => val.toLowerCase().includes(search));
  });
}

export function mergePaginatedMessages(
  existing: MessageRecord[],
  incoming: MessageRecord[],
  mode: 'replace' | 'prepend' | 'append'
): MessageRecord[] {
  const map = new Map<number, MessageRecord>();
  const orderedSource = mode === 'prepend'
    ? [...incoming, ...existing]
    : mode === 'append'
      ? [...existing, ...incoming]
      : [...incoming];
  for (const msg of orderedSource) {
    if (msg && typeof msg.id === 'number') {
      map.set(msg.id, msg);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.id - b.id);
}

export function appendPersistedMessage(
  existing: MessageRecord[],
  persisted: MessageRecord
): MessageRecord[] {
  const next = existing.filter((m) => m.id !== persisted.id);
  next.push(persisted);
  return next.sort((a, b) => a.id - b.id);
}

export function validateMessageAttachments(files: File[]): { valid: boolean; error?: string } {
  if (files.length > 5) {
    return { valid: false, error: 'You can attach at most 5 files per message.' };
  }

  for (const file of files) {
    const check = validateUploadFile(file, 'private');
    if (!check.valid) {
      return { valid: false, error: check.error || `Invalid file: ${file.name}` };
    }
  }

  return { valid: true };
}
