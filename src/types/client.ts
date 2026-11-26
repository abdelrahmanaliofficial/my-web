export type ClientAccountStatus = 'invited' | 'active' | 'suspended';

export interface ContractedService {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  pivot?: {
    contract_status?: 'active' | 'paused' | 'completed';
    assigned_at?: string | null;
    notes?: string | null;
  };
}

export interface ClientProject {
  id: number;
  project_code?: string;
  client_id: number;
  name?: string;
  title?: string;
  service_category?: string;
  status: string;
  progress_percentage?: number;
  expected_completion_date?: string | null;
  due_date?: string | null;
  description?: string | null;
  summary?: string | null;
  created_at?: string;
}

export interface ClientActivityEntry {
  id: number;
  client_id: number;
  action: string;
  description: string;
  created_at: string;
  actor?: {
    id: number;
    name: string;
    email: string;
  } | null;
}

export type InvitationDeliveryStatus = 'pending' | 'accepted' | 'test_sink' | 'not_configured' | 'failed';

export interface ClientInvitationSummary {
  id: number;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  delivery_status?: InvitationDeliveryStatus;
  delivery_accepted_at?: string | null;
  created_at: string;
}

export interface ClientRecord {
  id: number;
  client_code: string;
  user_id: number | null;
  full_name: string;
  email: string;
  phone: string | null;
  company_name: string | null;
  address: string | null;
  account_status: ClientAccountStatus;
  account_setup_completed?: boolean;
  invited_at?: string | null;
  activated_at?: string | null;
  suspended_at?: string | null;
  created_at: string;
  updated_at: string;
  services?: ContractedService[];
  projects?: ClientProject[];
  activity_logs?: ClientActivityEntry[];
  latest_invitation?: ClientInvitationSummary | null;
}

export interface CreateClientPayload {
  full_name: string;
  email: string;
  phone?: string;
  company_name?: string;
  address?: string;
  service_ids?: number[];
  send_invitation?: boolean;
}

export interface UpdateClientPayload {
  full_name?: string;
  email?: string;
  phone?: string | null;
  company_name?: string | null;
  address?: string | null;
  service_ids?: number[];
}

export interface UpdateOwnClientProfilePayload {
  full_name: string;
  phone: string;
  company_name: string;
  address: string;
}

/**
 * Strips restricted fields (role, account_status, client_code, permissions, email, id)
 * so client self-service updates transmit only explicitly permitted personal fields.
 */
export function sanitizeClientSelfUpdatePayload(
  input: Record<string, unknown>
): UpdateOwnClientProfilePayload {
  return {
    full_name: typeof input.full_name === 'string' ? input.full_name.trim() : '',
    phone: typeof input.phone === 'string' ? input.phone.trim() : '',
    company_name: typeof input.company_name === 'string' ? input.company_name.trim() : '',
    address: typeof input.address === 'string' ? input.address.trim() : '',
  };
}

export function filterClients(
  clients: ClientRecord[],
  criteria: {
    search?: string;
    status?: 'all' | ClientAccountStatus;
    serviceId?: number | 'all';
  }
): ClientRecord[] {
  const term = (criteria.search || '').trim().toLowerCase();
  const status = criteria.status || 'all';
  const serviceId = criteria.serviceId ?? 'all';

  return clients.filter((client) => {
    if (status !== 'all' && client.account_status !== status) {
      return false;
    }

    if (serviceId !== 'all') {
      const hasService = (client.services || []).some((s) => s.id === serviceId);
      if (!hasService) return false;
    }

    if (!term) return true;

    const haystack = [
      client.client_code,
      client.full_name,
      client.email,
      client.company_name || '',
      client.phone || '',
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(term);
  });
}
