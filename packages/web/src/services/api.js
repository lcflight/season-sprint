const BASE = process.env.VUE_APP_API_BASE_URL || "http://localhost:8787";

export async function getRecords(authorizationHeader) {
  if (!authorizationHeader) {
    throw new Error("Missing authorization header");
  }
  const response = await fetch(`${BASE}/me/records`, {
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
  const response = await fetch(`${BASE}/me/records`, {
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
