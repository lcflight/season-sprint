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

export async function getRecords(authorizationHeader) {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const apiBase = requireApiBaseUrl();
  const response = await fetch(`${apiBase}/me/records`, {
    headers: { Authorization: authorizationHeader },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch records: ${response.status}`);
  }

  return response.json();
}

export async function upsertRecord(date, winPoints, authorizationHeader) {
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
    body: JSON.stringify({ date, winPoints }),
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

export async function deleteAllRecords(authorizationHeader) {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const apiBase = requireApiBaseUrl();
  const response = await fetch(`${apiBase}/me/records`, {
    method: "DELETE",
    headers: { Authorization: authorizationHeader },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete records: ${response.status}`);
  }

  return response.json();
}

export async function bulkUpsertRecords(records, authorizationHeader) {
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
    body: JSON.stringify({ records }),
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
    body: JSON.stringify({ name }),
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
