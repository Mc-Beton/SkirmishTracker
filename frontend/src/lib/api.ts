// Browser-side API client. Session lives in HttpOnly cookies set by the backend;
// state-changing requests carry the CSRF token (double-submit cookie pattern).

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public fields?: Record<string, string>,
  ) {
    super(code);
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.split("=")[1];
}

async function ensureCsrfToken(): Promise<string> {
  let token = readCookie("XSRF-TOKEN");
  if (!token) {
    await fetch("/api/auth/csrf", { credentials: "same-origin" });
    token = readCookie("XSRF-TOKEN");
  }
  return decodeURIComponent(token ?? "");
}

// Single-flight refresh: parallel 401s share one refresh call. Two concurrent refreshes would
// present the same refresh token twice, which the backend treats as token theft.
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await rawRequest("POST", "/api/auth/refresh");
        return res.ok;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

/** Code of the ApiError thrown when the request never reached the server (no network). */
export const OFFLINE = "OFFLINE";

export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.code === OFFLINE;
}

async function rawRequest(method: string, path: string, body?: unknown): Promise<Response> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (MUTATING.has(method)) headers["X-XSRF-TOKEN"] = await ensureCsrfToken();
    return await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch() rejects only on network failure (offline, DNS, connection reset) – never on HTTP errors.
    throw new ApiError(0, OFFLINE);
  }
}

const NO_REFRESH = ["/api/auth/login", "/api/auth/refresh", "/api/auth/register"];

export async function api<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  let res = await rawRequest(method, path, body);
  if (res.status === 401 && !NO_REFRESH.includes(path)) {
    const refreshed = await refreshSession();
    // A failed refresh clears the stale cookies, so public GETs succeed anonymously on retry.
    if (refreshed || method === "GET") res = await rawRequest(method, path, body);
  }
  if (!res.ok) {
    let code = "INTERNAL_ERROR";
    let fields: Record<string, string> | undefined;
    try {
      const problem = await res.json();
      code = problem.code ?? problem.title ?? code;
      fields = problem.fields;
    } catch {
      if (res.status === 401) code = "UNAUTHORIZED";
      if (res.status === 403) code = "FORBIDDEN";
    }
    throw new ApiError(res.status, code, fields);
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export type Me = {
  id: string;
  email: string;
  displayName: string;
  locale: "pl" | "en";
  club: string | null;
  homeCity: string | null;
  roles: string[];
  hasPassword: boolean;
  createdAt: string;
  /** Confirms results entered by the opponent; false = those results are final at once. */
  confirmResults: boolean;
};
