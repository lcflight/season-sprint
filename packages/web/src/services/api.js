import { useAuth } from "@clerk/vue";

const BASE = "http://localhost:8787";

export async function getRecords() {
  const { getToken } = useAuth(); // returns a function that resolves the JWT

  const token = await getToken();

  return fetch(`${BASE}/me/records`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((response) => response.json());
}
