import { ref, readonly } from "vue";
import { apiFetch, getAuthToken, setAuthToken } from "@/src/lib/api";

export type AuthUser = {
  uid: string;
  email: string;
  name: string;
  groupId: string;
};

const USER_STORAGE_KEY = "vuepresyo.user.v1";

const userRef = ref<AuthUser | null>(null);
const loadingRef = ref<boolean>(true);
let initialized = false;

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function writeStoredUser(user: AuthUser | null): void {
  if (typeof window === "undefined") return;
  if (!user) {
    window.localStorage.removeItem(USER_STORAGE_KEY);
  } else {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }
}

export async function initAuth(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const token = getAuthToken();
  const cachedUser = readStoredUser();

  if (!token) {
    userRef.value = null;
    loadingRef.value = false;
    return;
  }

  if (cachedUser) {
    userRef.value = cachedUser;
    loadingRef.value = false;
  }

  try {
    const verified = await apiFetch<AuthUser>("/api/auth/me");
    userRef.value = verified;
    writeStoredUser(verified);
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 401 || status === 403) {
      setAuthToken(null);
      writeStoredUser(null);
      userRef.value = null;
    }
  } finally {
    loadingRef.value = false;
  }
}

export function useAuth() {
  if (!initialized && typeof window !== "undefined") {
    void initAuth();
  }

  async function signIn(email: string, password: string): Promise<void> {
    const res = await apiFetch<{ token: string; user: AuthUser }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    setAuthToken(res.token);
    writeStoredUser(res.user);
    userRef.value = res.user;
  }

  async function signOut(): Promise<void> {
    setAuthToken(null);
    writeStoredUser(null);
    userRef.value = null;
  }

  return {
    user: readonly(userRef),
    loading: readonly(loadingRef),
    signIn,
    signOut,
  };
}

