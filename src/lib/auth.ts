import {
  ApiError,
  apiRequest,
  clearAuthTokens,
  getAuthSessionVersion,
  isLogoutInProgress,
  logoutCurrentSession,
  storeAuthTokensFromResponse,
  withAuthSessionLock,
} from "@/lib/api";

export type LoginPayload = {
  identity: string;
  password: string;
  remember: boolean;
};

type LoginResponse = Record<string, unknown> & {
  user?: { roles?: string[] };
};

export function getPostLoginPath(roles: readonly string[] = []) {
  if (roles.includes("ADMIN")) return "/accounts";
  if (roles.includes("HR")) return "/employees";
  if (roles.includes("MANAGER")) return "/attendances";
  return "/profile";
}

// Chỉ mở phiên mới sau khi API xác thực thành công và người dùng chưa kết thúc lượt đăng nhập này ở tab khác.
export async function loginWithApi(payload: LoginPayload) {
  // Chờ lượt đăng xuất ở tab này; khóa dùng chung giúp login không chạy song song với refresh/hủy phiên ở tab khác.
  if (isLogoutInProgress()) await logoutCurrentSession().catch(() => undefined);
  return withAuthSessionLock(async () => {
    logoutClientSide();
    const sessionVersion = getAuthSessionVersion();

    const response = await apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      auth: false,
      credentials: "include",
      signal: AbortSignal.timeout(15000),
      body: {
        usernameOrEmail: payload.identity,
        password: payload.password,
        deviceInfo: payload.remember ? "HRM web - remember login" : "HRM web",
      },
    });

    if (sessionVersion !== getAuthSessionVersion()) {
      throw new ApiError("Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.", 401, undefined);
    }
    storeAuthTokensFromResponse(response, true);

    return response;
  });
}

// Xóa trạng thái cũ trước lượt đăng nhập; nút Đăng xuất phải dùng logoutCurrentSession để hủy cả phiên server.
export function logoutClientSide() {
  clearAuthTokens();
}

export { logoutCurrentSession };
