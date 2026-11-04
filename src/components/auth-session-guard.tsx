"use client";

import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  AUTH_SESSION_EVENT,
  getAuthSessionVersion,
  hasActiveAuthSession,
  isLogoutInProgress,
} from "@/lib/api";

// Trang được Back/Forward khôi phục phải đọc lại localStorage; tab khác đăng xuất cũng làm dữ liệu cũ biến mất.
function subscribeToAuthSession(onChange: () => void) {
  const events = [AUTH_SESSION_EVENT, "storage", "pageshow", "focus"];
  for (const event of events) window.addEventListener(event, onChange);
  return () => {
    for (const event of events) window.removeEventListener(event, onChange);
  };
}

// Dùng mã phiên làm snapshot để đổi tài khoản sẽ tạo lại cây màn hình và bỏ state của tài khoản trước.
function getSessionSnapshot() {
  if (hasActiveAuthSession()) return getAuthSessionVersion() || "legacy-session";
  return isLogoutInProgress() ? "logging-out" : "signed-out";
}

// Bảo vệ toàn bộ trang nghiệp vụ trước khi mount và khi phục hồi lịch sử; chờ API hủy phiên xong mới rời trang.
export default function AuthSessionGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSyncExternalStore(
    subscribeToAuthSession,
    getSessionSnapshot,
    () => "signed-out",
  );
  const publicPage = pathname === "/login" || pathname === "/";

  useEffect(() => {
    // Snapshot server chưa đọc được localStorage. Kiểm tra lại phía client để F5 không đẩy phiên hợp lệ về login.
    if (!publicPage && session === "signed-out" && !hasActiveAuthSession() && !isLogoutInProgress()) {
      window.location.replace("/login");
    }
  }, [publicPage, session]);

  if (publicPage) return children;
  if (session === "signed-out" || session === "logging-out") {
    return (
      <p className="p-6 text-sm text-muted-foreground" role="status">
        {session === "logging-out" ? "Đang đăng xuất..." : "Đang kiểm tra phiên đăng nhập..."}
      </p>
    );
  }
  return <Fragment key={session}>{children}</Fragment>;
}
