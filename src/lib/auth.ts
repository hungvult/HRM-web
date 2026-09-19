import { apiRequest } from "@/lib/api";

export type LoginPayload = {
  identity: string;
  password: string;
  remember: boolean;
};

type LoginResponse = Record<string, unknown>;

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

function pickToken(response: LoginResponse, keys: string[]) {
  const nested = asRecord(response.data) ?? asRecord(response.result);
  return readString(response, keys) || readString(nested, keys);
}

export async function loginWithApi(payload: LoginPayload) {
  const response = await apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    auth: false,
    credentials: "omit",
    body: {
      usernameOrEmail: payload.identity,
      password: payload.password,
      deviceInfo: payload.remember ? "HRM web - remember login" : "HRM web",
    },
  });

  if (typeof window !== "undefined") {
    const accessToken = pickToken(response, ["accessToken", "token", "jwt"]);
    const refreshToken = pickToken(response, ["refreshToken"]);

    if (accessToken) {
      window.localStorage.setItem("hrm_access_token", accessToken);
    }

    if (refreshToken) {
      window.localStorage.setItem("hrm_refresh_token", refreshToken);
    }
  }

  return response;
}

export function logoutClientSide() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem("hrm_access_token");
  window.localStorage.removeItem("hrm_refresh_token");
}
