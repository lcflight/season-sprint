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
