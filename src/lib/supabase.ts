import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface PublicConfigStatus {
  configured: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  missingEnv: string[];
  schemaReady: boolean;
  schemaError?: string;
}

let cachedClient: SupabaseClient | null = null;
let cachedConfig: PublicConfigStatus | null = null;

export async function loadPublicConfig(): Promise<PublicConfigStatus> {
  if (cachedConfig) return cachedConfig;

  // Server Secrets are authoritative. VITE_* values are only a fallback because
  // an old VITE key can otherwise override the current Supabase project key.
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const envAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

  const res = await fetch('/api/config/public', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Gagal memuat konfigurasi Supabase (HTTP ${res.status})`);
  }
  const serverCfg = (await res.json()) as PublicConfigStatus;

  const finalUrl = serverCfg.supabaseUrl || envUrl || '';
const finalAnon = serverCfg.supabaseAnonKey || envAnon || '';

  cachedConfig = {
    configured: Boolean(finalUrl && finalAnon && serverCfg.configured),
    supabaseUrl: finalUrl,
    supabaseAnonKey: finalAnon,
    missingEnv: serverCfg.missingEnv || [],
    schemaReady: serverCfg.schemaReady,
    schemaError: serverCfg.schemaError,
  };
  return cachedConfig;
}

export function resetPublicConfigCache() {
  cachedConfig = null;
}

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (cachedClient) return cachedClient;
  const cfg = await loadPublicConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    return null;
  }
  try {
    const parsedUrl = new URL(cfg.supabaseUrl);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
      throw new Error('URL Supabase harus menggunakan HTTPS');
    }
    if (!parsedUrl.hostname.endsWith('.supabase.co') && parsedUrl.hostname !== 'localhost') {
      throw new Error('URL bukan domain project Supabase yang valid');
    }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'URL Supabase tidak valid');
  }
  cachedClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cachedClient;
}

export async function getAccessToken(): Promise<string | null> {
  const client = await getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      (json && typeof json.error === 'string' && json.error) ||
      `Request failed (${res.status})`;
    const err = new Error(errMsg) as Error & { code?: string; status?: number };
    err.code = json?.code;
    err.status = res.status;
    throw err;
  }
  return json as T;
}
