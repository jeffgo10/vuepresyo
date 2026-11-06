const TOKEN_STORAGE_KEY = "vuepresyo.jwt.v1";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (!token) {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } else {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
}

export class ApiError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (
    options.body &&
    typeof options.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      if (body?.error) message = body.error;
      if (body?.code) code = body.code;
    } catch {
      // ignore json parse failure
    }
    throw new ApiError(message, code, res.status);
  }

  return (await res.json()) as T;
}

export async function callBackendFunction<TReq, TRes>(
  name: string,
  payload: TReq,
): Promise<TRes> {
  return apiFetch<TRes>(`/api/functions/${name}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadStorageBlob(
  storagePath: string,
  blob: Blob | File,
): Promise<{ storagePath: string; url: string }> {
  const token = getAuthToken();
  const headers = new Headers({
    "Content-Type": blob.type || "image/jpeg",
  });
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(
    `/api/storage/upload?path=${encodeURIComponent(storagePath)}`,
    {
      method: "POST",
      headers,
      body: blob,
    },
  );

  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new ApiError(message, undefined, res.status);
  }

  return (await res.json()) as { storagePath: string; url: string };
}

export function getStorageDownloadUrl(storagePath: string): string {
  return `/api/storage/${storagePath}`;
}

