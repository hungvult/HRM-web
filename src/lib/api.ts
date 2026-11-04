const DEFAULT_API_BASE_URL = "/api/v1";
const ACCESS_TOKEN_KEY = "hrm_access_token";
const LEGACY_REFRESH_TOKEN_KEY = "hrm_refresh_token";
const AUTH_SESSION_KEY = "hrm_auth_session";
export const AUTH_SESSION_EVENT = "hrm-auth-session-change";
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
let logoutPromise: Promise<void> | null = null;
let logoutPending = false;

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

// Mỗi lần đăng nhập/đăng xuất đổi mã phiên cục bộ để nhận ra phản hồi của phiên cũ.
export function getAuthSessionVersion() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AUTH_SESSION_KEY) ?? "";
}

// Dùng cho trang bảo vệ và API; dấu đăng xuất được chia sẻ giữa các tab cùng website.
export function hasActiveAuthSession() {
  return Boolean(getAccessToken()) && !getAuthSessionVersion().startsWith("logged-out:");
}

// Tab đang gọi API đăng xuất cần chờ hủy phiên xong trước khi rời trang.
export function isLogoutInProgress() {
  return logoutPending;
}

// Báo cho trang hiện tại kiểm tra lại phiên; các tab khác nhận sự kiện storage của trình duyệt.
function notifyAuthSessionChanged() {
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

// Xóa token và lưu dấu đăng xuất để cookie cũ không tự khôi phục phiên khi Back hoặc tải lại.
export function clearAuthTokens() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_SESSION_KEY, `logged-out:${crypto.randomUUID()}`);
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  notifyAuthSessionChanged();
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

// Chỉ phản hồi đăng nhập mới được mở lại phiên đã đăng xuất; refresh chỉ cập nhật phiên đang hoạt động.
export function storeAuthTokensFromResponse(payload: unknown, newSession = false) {
  if (typeof window === "undefined") {
    return "";
  }

  if (!newSession && getAuthSessionVersion().startsWith("logged-out:")) return "";
  const accessToken = pickToken(payload, ["accessToken", "token", "jwt"]);

  if (accessToken) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (newSession) window.localStorage.setItem(AUTH_SESSION_KEY, `active:${crypto.randomUUID()}`);
    notifyAuthSessionChanged();
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

// Các tab cùng origin tuần tự hóa refresh và hủy phiên để tránh xoay token trong lúc đăng xuất.
export async function withAuthSessionLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return await navigator.locks.request("hrm-auth-session", { signal: AbortSignal.timeout(15000) }, action);
  }
  return action();
}

// Thu hồi đúng phiên chứa trong access token; gọi trực tiếp để không tự refresh lại khi đang đăng xuất.
async function revokeAccessToken(accessToken: string) {
  return sendRequest(
    "/auth/logout",
    { method: "POST", auth: false, signal: AbortSignal.timeout(15000) },
    {
      headers: new Headers({ Accept: "application/json", Authorization: `Bearer ${accessToken}` }),
      body: undefined,
    },
  );
}

// Đọc cookie HttpOnly để xoay phiên. Khi đăng xuất chỉ lấy token để hủy phiên, không lưu vào trình duyệt.
async function requestTokenRefresh(sessionVersion: string, forLogout = false) {
  const response = await fetch(resolveUrl("/auth/refresh"), {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const payload = parsePayload(text);

  if (!response.ok) {
    if (!forLogout && sessionVersion === getAuthSessionVersion()) clearAuthTokens();
    throw new ApiError(SESSION_EXPIRED_MESSAGE, response.status, payload);
  }

  const accessToken = pickToken(payload, ["accessToken", "token", "jwt"]);

  if (!accessToken) {
    if (!forLogout && sessionVersion === getAuthSessionVersion()) clearAuthTokens();
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, payload);
  }

  // Refresh đã gửi trước lúc đăng xuất có thể tạo phiên mới ở server. Thu hồi phiên đó thay vì lưu token muộn.
  if (!forLogout && sessionVersion !== getAuthSessionVersion()) {
    const revoked = await revokeAccessToken(accessToken);
    if (!revoked.ok && revoked.status !== 401) {
      throw new ApiError("Không thể xác nhận hủy phiên đăng nhập cũ.", revoked.status, undefined);
    }
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, undefined);
  }
  if (!forLogout) storeAuthTokensFromResponse(payload);
  return accessToken;
}

// Nhiều API lỗi 401 trong cùng tab dùng chung một lượt refresh và kiểm tra lại phiên sau khi lấy khóa.
function refreshAccessToken(sessionVersion: string) {
  if (!refreshPromise) {
    refreshPromise = withAuthSessionLock(() => {
      if (sessionVersion !== getAuthSessionVersion() || !hasActiveAuthSession()) {
        throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, undefined);
      }
      return requestTokenRefresh(sessionVersion);
    }).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

// Đăng xuất chặn API ngay, chờ refresh đã gửi xong rồi thu hồi phiên hiện tại và cookie bằng API có sẵn.
export function logoutCurrentSession() {
  if (logoutPromise) return logoutPromise;
  const accessToken = getAccessToken();
  logoutPending = true;
  clearAuthTokens();
  const sessionVersion = getAuthSessionVersion();
  const pendingRefresh = refreshPromise;
  logoutPromise = (async () => {
    // Refresh chạy trước sẽ tự thu hồi token trả về muộn; bỏ lỗi đó để tiếp tục hủy phiên/cookie còn lại.
    await pendingRefresh?.catch(() => undefined);
    await withAuthSessionLock(async () => {
      // Login ở tab khác có thể lấy khóa trước. Khi đó không gửi logout cũ vì phản hồi sẽ xóa cookie phiên mới.
      if (sessionVersion !== getAuthSessionVersion() && hasActiveAuthSession()) return;
      let response = await revokeAccessToken(accessToken ?? "");
      if (response.status === 401) {
        // Tab khác đã đăng nhập phiên mới thì không dùng cookie mới để hủy nhầm phiên đó.
        if (sessionVersion !== getAuthSessionVersion() && hasActiveAuthSession()) return;
        // Access token đã hết hạn: dùng cookie lấy đúng phiên mới chỉ để hủy, không khôi phục đăng nhập.
        try {
          const token = await requestTokenRefresh(getAuthSessionVersion(), true);
          response = await revokeAccessToken(token);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) return;
          throw error;
        }
      }
      if (!response.ok) {
        throw new ApiError("Không thể xác nhận đăng xuất trên máy chủ. Vui lòng thử lại.", response.status, undefined);
      }
    });
  })().finally(() => {
    logoutPending = false;
    logoutPromise = null;
    // Nút Đăng xuất sẽ tải trang login sau khi nhận kết quả; tránh guard cùng phát lệnh chuyển trang thứ hai.
  });
  return logoutPromise;
}

function redirectToLoginAfterSessionExpired() {
  if (typeof window === "undefined" || window.location.pathname === "/login") {
    return;
  }

  window.location.href = new URL("/login", window.location.origin).toString();
}

// API bảo vệ chỉ chạy trong phiên hiện tại; phản hồi của phiên cũ không được dùng để gửi lại hoặc hiển thị dữ liệu.
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}) {
  const sessionVersion = getAuthSessionVersion();
  const protectedRequest = options.auth !== false && typeof window !== "undefined";
  if (protectedRequest && !hasActiveAuthSession()) {
    if (!logoutPending) redirectToLoginAfterSessionExpired();
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, undefined);
  }
  const prepared = prepareRequest(options);
  let response = await sendRequest(path, options, prepared);

  // Người dùng có thể đăng xuất hoặc đăng nhập tài khoản khác trong lúc request đang chạy.
  if (protectedRequest && sessionVersion !== getAuthSessionVersion()) {
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, undefined);
  }

  if (
    response.status === 401 &&
    options.auth !== false &&
    !isRefreshPath(path) &&
    typeof window !== "undefined"
  ) {
    try {
      const accessToken = await refreshAccessToken(sessionVersion);
      if (sessionVersion !== getAuthSessionVersion()) {
        throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, undefined);
      }
      response = await sendRequest(path, options, prepared, accessToken);
    } catch (error) {
      if (!logoutPending && (sessionVersion === getAuthSessionVersion() || !hasActiveAuthSession())) {
        redirectToLoginAfterSessionExpired();
      }

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, undefined);
    }
  }

  const text = await response.text();
  const payload = parsePayload(text);

  // Kiểm tra thêm sau khi đọc body vì đăng xuất có thể xảy ra trong lúc tải phản hồi hoặc gửi lại API.
  if (protectedRequest && sessionVersion !== getAuthSessionVersion()) {
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, undefined);
  }

  if (!response.ok) {
    throw new ApiError(
      resolveErrorMessage(payload, "Không thể hoàn tất yêu cầu. Vui lòng thử lại sau."),
      response.status,
      payload,
    );
  }

  return payload as T;
}
