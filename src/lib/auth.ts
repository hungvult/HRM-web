import { apiRequest, clearAuthTokens, storeAuthTokensFromResponse } from "@/lib/api";

export type LoginPayload = {
  identity: string;
  password: string;
  remember: boolean;
};

type LoginResponse = Record<string, unknown>;

export async function loginWithApi(payload: LoginPayload) {
  logoutClientSide();

  const response = await apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    auth: false,
    credentials: "include",
    body: {
      usernameOrEmail: payload.identity,
      password: payload.password,
      deviceInfo: payload.remember ? "HRM web - remember login" : "HRM web",
    },
  });

  storeAuthTokensFromResponse(response);

  return response;
}

export function logoutClientSide() {
  clearAuthTokens();
}
