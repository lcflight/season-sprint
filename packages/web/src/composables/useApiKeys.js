import { reactive, ref } from "vue";
import {
  getApiKeys,
  createApiKey,
  revokeApiKey,
  getAuthorizationHeader,
} from "@/services/api";

export function useApiKeys() {
  const apiKeys = reactive([]);
  const isLoading = ref(false);
  const error = ref("");

  async function load() {
    isLoading.value = true;
    error.value = "";
    try {
      const authHeader = await getAuthorizationHeader();
      if (!authHeader) return;
      const keys = await getApiKeys(authHeader);
      apiKeys.splice(0, apiKeys.length, ...keys);
    } catch (e) {
      error.value = "Failed to load API keys.";
      console.error(e);
    } finally {
      isLoading.value = false;
    }
  }

  async function create(name) {
    error.value = "";
    try {
      const authHeader = await getAuthorizationHeader();
      if (!authHeader) throw new Error("Not authenticated");
      const result = await createApiKey(name, authHeader);
      apiKeys.unshift(result);
      return result;
    } catch (e) {
      error.value = "Failed to create API key.";
      console.error(e);
      return null;
    }
  }

  async function revoke(keyId) {
    error.value = "";
    try {
      const authHeader = await getAuthorizationHeader();
      if (!authHeader) throw new Error("Not authenticated");
      await revokeApiKey(keyId, authHeader);
      const idx = apiKeys.findIndex((k) => k.id === keyId);
      if (idx !== -1) apiKeys.splice(idx, 1);
    } catch (e) {
      error.value = "Failed to revoke API key.";
      console.error(e);
    }
  }

  return { apiKeys, isLoading, error, load, create, revoke };
}
