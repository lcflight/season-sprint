const BASE = "http://localhost:8787";

async function getClerkToken(): Promise<string | undefined> {
  const clerk = (window as any).Clerk;
  if (clerk?.load) await clerk.load();
  return clerk?.session?.getToken?.();
}

async function authorizedFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getClerkToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Request failed: ${res.status} ${res.statusText}${body ? ` - ${body}` : ""}`);
  }
  return res.json();
}

export async function getUser() {
  return authorizedFetch("/me");
}

export async function getRecords() {
  return authorizedFetch("/me/records");
}
