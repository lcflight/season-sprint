import {
  CreateRecordInputSchema,
  BulkUpsertInputSchema,
  CreateApiKeyInputSchema,
  CreateFlagInputSchema,
  ToggleFlagInputSchema,
  SetUserOverrideInputSchema,
  SetUserAdminInputSchema,
} from "@season-sprint/shared";

const isLocalDevHost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

const BASE = process.env.VUE_APP_API_BASE_URL || (isLocalDevHost ? "http://localhost:8787" : "");

function requireApiBaseUrl() {
  if (!BASE) {
    throw new Error(
      "Missing VUE_APP_API_BASE_URL for non-local environment. Configure your deployed worker URL."
    );
  }
  return BASE;
}

// Validates a request payload against the shared API contract before it's sent,
// so a shape drift between web and server surfaces at the call site instead of
// as an opaque 400 from the worker.
function validateBody(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

export async function getRecords(authorizationHeader, mode = "world-tour") {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const apiBase = requireApiBaseUrl();
  const response = await fetch(
    `${apiBase}/me/records?mode=${encodeURIComponent(mode)}`,
    {
      headers: { Authorization: authorizationHeader },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch records: ${response.status}`);
  }

  return response.json();
}

export async function upsertRecord(
  date,
  winPoints,
  authorizationHeader,
  mode = "world-tour"
) {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const apiBase = requireApiBaseUrl();
  const response = await fetch(`${apiBase}/me/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorizationHeader,
    },
    body: JSON.stringify(validateBody(CreateRecordInputSchema, { date, winPoints, mode })),
  });

  if (!response.ok) {
    throw new Error(`Failed to upsert record: ${response.status}`);
  }

  return response.json();
}

export async function deleteRecord(id, authorizationHeader) {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const apiBase = requireApiBaseUrl();
  const response = await fetch(`${apiBase}/me/records/${id}`, {
    method: "DELETE",
    headers: { Authorization: authorizationHeader },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete record: ${response.status}`);
  }

  return response.json();
}

export async function deleteAllRecords(
  authorizationHeader,
  mode = "world-tour"
) {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const apiBase = requireApiBaseUrl();
  const response = await fetch(
    `${apiBase}/me/records?mode=${encodeURIComponent(mode)}`,
    {
      method: "DELETE",
      headers: { Authorization: authorizationHeader },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete records: ${response.status}`);
  }

  return response.json();
}

export async function bulkUpsertRecords(
  records,
  authorizationHeader,
  mode = "world-tour"
) {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const apiBase = requireApiBaseUrl();
  const response = await fetch(`${apiBase}/me/records/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorizationHeader,
    },
    body: JSON.stringify(validateBody(BulkUpsertInputSchema, { records, mode })),
  });

  if (!response.ok) {
    throw new Error(`Failed to bulk upsert records: ${response.status}`);
  }

  return response.json();
}

export async function getApiKeys(authorizationHeader) {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const apiBase = requireApiBaseUrl();
  const response = await fetch(`${apiBase}/me/api-keys`, {
    headers: { Authorization: authorizationHeader },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch API keys: ${response.status}`);
  }

  return response.json();
}

export async function createApiKey(name, authorizationHeader) {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const apiBase = requireApiBaseUrl();
  const response = await fetch(`${apiBase}/me/api-keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorizationHeader,
    },
    body: JSON.stringify(validateBody(CreateApiKeyInputSchema, { name })),
  });

  if (!response.ok) {
    throw new Error(`Failed to create API key: ${response.status}`);
  }

  return response.json();
}

export async function revokeApiKey(keyId, authorizationHeader) {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const apiBase = requireApiBaseUrl();
  const response = await fetch(`${apiBase}/me/api-keys/${keyId}`, {
    method: "DELETE",
    headers: { Authorization: authorizationHeader },
  });

  if (!response.ok) {
    throw new Error(`Failed to revoke API key: ${response.status}`);
  }

  return response.json();
}

// ── Feature flags ───────────────────────────────────────────────────────────

export async function getFlags(authorizationHeader) {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const apiBase = requireApiBaseUrl();
  const response = await fetch(`${apiBase}/me/flags`, {
    headers: { Authorization: authorizationHeader },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch flags: ${response.status}`);
  }

  return response.json();
}

async function adminFetch(path, authorizationHeader, options = {}) {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const apiBase = requireApiBaseUrl();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: authorizationHeader,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Admin request failed: ${response.status}`);
  }

  return response.json();
}

export function adminListFlags(authorizationHeader) {
  return adminFetch("/admin/flags", authorizationHeader);
}

export function adminCreateFlag(key, description, authorizationHeader) {
  return adminFetch("/admin/flags", authorizationHeader, {
    method: "POST",
    body: JSON.stringify(validateBody(CreateFlagInputSchema, { key, description })),
  });
}

export function adminToggleFlag(key, enabledGlobally, authorizationHeader) {
  return adminFetch(`/admin/flags/${encodeURIComponent(key)}`, authorizationHeader, {
    method: "PATCH",
    body: JSON.stringify(validateBody(ToggleFlagInputSchema, { enabledGlobally })),
  });
}

export function adminSearchUsers(email, authorizationHeader) {
  return adminFetch(
    `/admin/users?email=${encodeURIComponent(email)}`,
    authorizationHeader
  );
}

export function adminSetUserOverride(userId, flagKey, enabled, authorizationHeader) {
  return adminFetch(
    `/admin/users/${encodeURIComponent(userId)}/flags/${encodeURIComponent(flagKey)}`,
    authorizationHeader,
    { method: "PUT", body: JSON.stringify(validateBody(SetUserOverrideInputSchema, { enabled })) }
  );
}

export function adminClearUserOverride(userId, flagKey, authorizationHeader) {
  return adminFetch(
    `/admin/users/${encodeURIComponent(userId)}/flags/${encodeURIComponent(flagKey)}`,
    authorizationHeader,
    { method: "DELETE" }
  );
}

export function adminSetUserAdmin(userId, isAdmin, authorizationHeader) {
  return adminFetch(`/admin/users/${encodeURIComponent(userId)}`, authorizationHeader, {
    method: "PATCH",
    body: JSON.stringify(validateBody(SetUserAdminInputSchema, { isAdmin })),
  });
}

export async function getAuthorizationHeader() {
  try {
    const { getAuthToken } = await import("./clerk.js");
    const clerkToken = await getAuthToken();
    if (clerkToken) {
      return `Bearer ${clerkToken}`;
    }
  } catch {
    // Clerk not available
  }

  // Fall back to dev token on localhost
  if (isLocalDevHost && process.env.VUE_APP_DEV_AUTH_TOKEN) {
    return process.env.VUE_APP_DEV_AUTH_TOKEN;
  }

  return null;
}
