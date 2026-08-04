import { supabase } from './supabase';

// ── Cliente Oculto (shadow) backend ──────────────────────────────────────────
// All calls go through the existing evolution-proxy Edge Function using the
// logged-in user's session (anon key fallback). Real security is enforced by
// RLS — the shadow_* tables and these endpoints are master-only on the backend.

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-proxy`;

async function shadowProxy<T>(endpoint: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ endpoint, method, body }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export interface ShadowInstance {
  id: string;            // uuid (shadow_instances.id) — usado em shadow_schedules.instance_id
  instance_name: string; // usado nos endpoints /shadow/connect|status|groups|DELETE
  label: string;
  is_connected: boolean;
  live_state: string; // "open" = conectado
}

export interface ShadowGroup {
  jid: string;
  name: string;
}

export interface ShadowConnectResponse {
  base64?: string;
  code?: string;
  // some responses nest the QR inside another object — handled by the caller
  [key: string]: unknown;
}

export interface ShadowStatusResponse {
  is_connected: boolean;
  live_state?: string;
}

export const shadowApi = {
  listInstances(): Promise<ShadowInstance[]> {
    return shadowProxy<ShadowInstance[]>('/shadow/instances', 'GET');
  },

  addInstance(label: string): Promise<ShadowInstance> {
    return shadowProxy<ShadowInstance>('/shadow/instances', 'POST', { label });
  },

  removeInstance(instance_name: string): Promise<unknown> {
    return shadowProxy('/shadow/instances', 'DELETE', { instance_name });
  },

  connect(instance_name: string): Promise<ShadowConnectResponse> {
    return shadowProxy<ShadowConnectResponse>('/shadow/connect', 'POST', { instance_name });
  },

  status(instance_name: string): Promise<ShadowStatusResponse> {
    return shadowProxy<ShadowStatusResponse>('/shadow/status', 'POST', { instance_name });
  },

  groups(instance_name: string): Promise<ShadowGroup[]> {
    return shadowProxy<ShadowGroup[]>('/shadow/groups', 'POST', { instance_name });
  },
};

// Extract a renderable QR-code image data URL from a connect response.
// The QR may arrive in `base64` or `code`, possibly nested one level deep,
// and may or may not already carry the data: prefix.
export function extractQrDataUrl(resp: ShadowConnectResponse | null | undefined): string | null {
  if (!resp || typeof resp !== 'object') return null;

  const pickString = (obj: Record<string, unknown>): string | null => {
    const raw = (obj.base64 ?? obj.code) as unknown;
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  };

  let raw = pickString(resp as Record<string, unknown>);

  // tolerate one level of nesting (e.g. { qrcode: { base64 } })
  if (!raw) {
    for (const value of Object.values(resp)) {
      if (value && typeof value === 'object') {
        raw = pickString(value as Record<string, unknown>);
        if (raw) break;
      }
    }
  }

  if (!raw) return null;
  return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
}
