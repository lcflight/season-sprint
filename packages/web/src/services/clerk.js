import { useUser, useAuth } from "@clerk/vue";

const w = typeof window !== "undefined" ? window : undefined;

/**
 * Normalizes a Clerk user into a lightweight POJO for app-wide use.
 */
function normalizeUser(u) {
  if (!u) return null;
  const primaryEmail =
    u.primaryEmailAddress?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? null;

  return {
    id: u.id,
    email: primaryEmail,
    username: u.username ?? null,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    imageUrl: u.imageUrl ?? null,
    // Keep the raw user available if you need additional fields
    _raw: u,
  };
}

async function waitForClerk(timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const clerk = w?.Clerk;
      if (clerk && (clerk.loaded === true || clerk.user || clerk.session)) {
        resolve(clerk);
        return;
      }
      if (timeoutMs && timeoutMs > 0 && Date.now() - start > timeoutMs) {
        resolve(undefined);
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

/**
 * Returns the current Clerk user immediately if available; otherwise null.
 * Useful when you don't want to wait for Clerk to finish loading.
 */
export function getClerkUserSync() {
  try {
    const { isLoaded, isSignedIn, user } = useUser();
    if (isLoaded?.value && isSignedIn?.value && user?.value) {
      return normalizeUser(user.value);
    }
  } catch (_) {
    // Using Clerk composable outside of component setup; fall back to window.Clerk
  }
  const clerkUser = w?.Clerk?.user;
  return clerkUser ? normalizeUser(clerkUser) : null;
}

/**
 * Resolves with the current Clerk user once Clerk has loaded.
 * If the user is signed out, resolves to null.
 *
 * @param {{ waitForLoad?: boolean, timeoutMs?: number }} [options]
 *  - waitForLoad: if false and Clerk isn't loaded yet, return null immediately.
 *  - timeoutMs: maximum time to wait before resolving null (default 8000ms). Set to 0/undefined to wait indefinitely.
 */
export async function getClerkUser(options = {}) {
  const { waitForLoad = true, timeoutMs = 8000 } = options;

  // Try via composable first (works within component setup)
  try {
    const { isLoaded, isSignedIn, user } = useUser();
    if (isLoaded?.value) {
      return isSignedIn?.value ? normalizeUser(user?.value) : null;
    }
    if (!waitForLoad) return null;

    // Wait reactively for composable to load
    return await new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (isLoaded?.value) {
          resolve(isSignedIn?.value ? normalizeUser(user?.value) : null);
          return;
        }
        if (timeoutMs && timeoutMs > 0 && Date.now() - start > timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(check, 50);
      };
      check();
    });
  } catch (_) {
    // Probably outside component setup; fall back to window.Clerk
  }

  if (!waitForLoad) {
    return w?.Clerk?.user ? normalizeUser(w.Clerk.user) : null;
  }

  await waitForClerk(timeoutMs);
  return w?.Clerk?.user ? normalizeUser(w.Clerk.user) : null;
}

/**
 * Convenience helper to fetch a Clerk session token (JWT) for API calls.
 * Works both inside and outside of component setup.
 */
export async function getAuthToken(getTokenOptions) {
  // Try composable first (inside component setup)
  try {
    const { getToken } = useAuth();
    if (typeof getToken === "function") {
      return await getToken(getTokenOptions);
    }
  } catch (_) {
    // Using Clerk composable outside of setup; fall back to window.Clerk
  }

  // Fallback to ClerkJS global
  const clerk = w?.Clerk ?? (await waitForClerk(8000));
  const session = clerk?.session;
  if (session && typeof session.getToken === "function") {
    return await session.getToken(getTokenOptions);
  }
  return null;
}
