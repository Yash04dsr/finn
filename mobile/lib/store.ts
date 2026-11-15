/**
 * Small AsyncStorage-backed store: backend base URL + chat session id.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL_KEY = 'finn.baseUrl';
const SESSION_KEY = 'finn.chatSessionId';

export const DEFAULT_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

function isPrivateBaseUrl(raw: string): boolean {
  try {
    const host = new URL(normalizeBaseUrl(raw)).hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')) return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
    const match = host.match(/^172\.(\d+)\./);
    if (!match) return false;
    const second = Number(match[1]);
    return second >= 16 && second <= 31;
  } catch {
    return false;
  }
}

export async function loadBaseUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(BASE_URL_KEY);
    const chosen = stored ? normalizeBaseUrl(stored) : DEFAULT_BASE_URL;
    const storedHost = (() => {
      try {
        return new URL(chosen).hostname.toLowerCase();
      } catch {
        return '';
      }
    })();
    const defaultHost = (() => {
      try {
        return new URL(DEFAULT_BASE_URL).hostname.toLowerCase();
      } catch {
        return '';
      }
    })();
    const staleTunnel = storedHost.endsWith('.trycloudflare.com') || storedHost.endsWith('.loca.lt');
    const staleLan = isPrivateBaseUrl(chosen) && storedHost !== defaultHost;
    // Drop a saved address that cannot reach this session: an old Wi-Fi IP, or a tunnel that has closed.
    if (chosen !== DEFAULT_BASE_URL && (staleLan || staleTunnel)) {
      await AsyncStorage.setItem(BASE_URL_KEY, DEFAULT_BASE_URL);
      return DEFAULT_BASE_URL;
    }
    return chosen;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

export async function saveBaseUrl(raw: string): Promise<string> {
  const normalized = normalizeBaseUrl(raw);
  try {
    await AsyncStorage.setItem(BASE_URL_KEY, normalized);
  } catch {
    // persistence failure is non-fatal; session keeps working in memory
  }
  return normalized;
}

export async function loadSessionId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export async function saveSessionId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_KEY, id);
  } catch {
    // non-fatal
  }
}

/** Stable per-install session id (used as chat session_id default). */
export async function getOrCreateSessionId(): Promise<string> {
  const existing = await loadSessionId();
  if (existing) return existing;
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `finn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await saveSessionId(id);
  return id;
}
