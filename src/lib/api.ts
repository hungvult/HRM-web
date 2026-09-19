const DEFAULT_API_BASE_URL = "/api/v1";
const ACCESS_TOKEN_KEY = "hrm_access_token";
const LEGACY_REFRESH_TOKEN_KEY = "hrm_refresh_token";
const SESSION_EXPIRED_MESSAGE = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";

type ApiBody = BodyInit | Record<string, unknown> | unknown[] | null;

export type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: ApiBody;
  auth?: boolean;
};

type PreparedRequest = {
  body: BodyInit | null | undefined;
  headers: Headers;
};

let refreshPromise: Promise<string> | null = null;

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  return (configured || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

function getAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function clearAuthTokens() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) {
    return "";
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

function pickToken(payload: unknown, keys: string[]) {
  const response = asRecord(payload);
  const nested = asRecord(response?.data) ?? asRecord(response?.result);

  return readString(response, keys) || readString(nested, keys);
}

export function storeAuthTokensFromResponse(payload: unknown) {
  if (typeof window === "undefined") {
    return "";
  }

  const accessToken = pickToken(payload, ["accessToken", "token", "jwt"]);

  if (accessToken) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  }

  window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  return accessToken;
}

function isBodyInit(body: ApiBody): body is BodyInit {
  return (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer
  );
}

function resolveUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${getApiBaseUrl()}/${path.replace(/^\/+/, "")}`;
}

function parsePayload(text: string) {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function resolveErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.detail;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function prepareRequest(options: ApiRequestOptions): PreparedRequest {
  const headers = new Headers(options.headers);
  let body: BodyInit | null | undefined;

  if (options.body !== undefined && options.body !== null) {
    if (isBodyInit(options.body)) {
      body = options.body;
    } else {
      body = JSON.stringify(options.body);
      headers.set("Content-Type", "application/json");
    }
  }

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  return { body, headers };
}

function applyAuthorization(headers: Headers, token: string | null) {
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
}

function isRefreshPath(path: string) {
  return /\/auth\/refresh(?:$|[?#])/i.test(path);
}

async function sendRequest(
  path: string,
  options: ApiRequestOptions,
  prepared: PreparedRequest,
  tokenOverride?: string,
) {
  const headers = new Headers(prepared.headers);
  const token = tokenOverride ?? getAccessToken();
  const { auth } = options;
  const requestOptions = { ...options } as RequestInit & {
    auth?: boolean;
    body?: ApiBody;
  };
  delete requestOptions.auth;
  delete requestOptions.body;

  if (auth !== false) {
    applyAuthorization(headers, token);
  }

  return fetch(resolveUrl(path), {
    ...requestOptions,
    body: prepared.body,
    cache: "no-store",
    credentials: options.credentials ?? "include",
    headers,
  });
}

async function requestTokenRefresh() {
  const response = await fetch(resolveUrl("/auth/refresh"), {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const payload = parsePayload(text);

  if (!response.ok) {
    clearAuthTokens();
    throw new ApiError(SESSION_EXPIRED_MESSAGE, response.status, payload);
  }

  const accessToken = storeAuthTokensFromResponse(payload);

  if (!accessToken) {
    clearAuthTokens();
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, payload);
  }

  return accessToken;
}

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = requestTokenRefresh().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

function redirectToLoginAfterSessionExpired() {
  if (typeof window === "undefined" || window.location.pathname === "/login") {
    return;
  }

  window.location.href = new URL("/login", window.location.origin).toString();
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}) {
  const prepared = prepareRequest(options);
  let response = await sendRequest(path, options, prepared);

  if (
    response.status === 401 &&
    options.auth !== false &&
    !isRefreshPath(path) &&
    typeof window !== "undefined"
  ) {
    try {
      const accessToken = await refreshAccessToken();
      response = await sendRequest(path, options, prepared, accessToken);
    } catch (error) {
      redirectToLoginAfterSessionExpired();

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, undefined);
    }
  }

  const text = await response.text();
  const payload = parsePayload(text);

  if (!response.ok) {
    throw new ApiError(
      resolveErrorMessage(payload, "Không thể hoàn tất yêu cầu. Vui lòng thử lại sau."),
      response.status,
      payload,
    );
  }

  return payload as T;
}
