import { apiRequest, ApiError } from "@/lib/api";
import { fetchPage } from "@/lib/hrm-api";

export type HrmNotification = {
  id: number;
  type: string;
  title: string;
  content: string;
  relatedEntity: { type: string; id: number } | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
};
export const notificationsApiEnabled =
  process.env.NEXT_PUBLIC_HRM_NOTIFICATIONS_API_ENABLED !== "false";
export function notificationLink(notification: HrmNotification) {
  const related = notification.relatedEntity;
  // Never use an arbitrary URL from notification content.
  return related?.type === "LEAVE_REQUEST" &&
    Number.isSafeInteger(related.id) &&
    related.id > 0
    ? `/leave-requests/${related.id}`
    : null;
}
export function notificationTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}
export function notificationError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403 || error.status === 404)
      return "Thông báo không tồn tại hoặc không thuộc quyền truy cập của bạn.";
  }
  return "Không thể tải hoặc cập nhật thông báo. Vui lòng thử lại.";
}
function validateId(id: number) {
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error("Mã thông báo không hợp lệ.");
}
export async function fetchNotifications(
  page: number,
  size: number,
  signal?: AbortSignal,
) {
  try {
    return await fetchPage<HrmNotification>(
      "/notifications",
      { page, size },
      signal,
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(notificationError(error));
  }
}
export async function fetchUnreadCount(signal?: AbortSignal) {
  try {
    return await apiRequest<{ unreadCount: number }>(
      "/notifications/unread-count",
      { signal },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(notificationError(error));
  }
}
export async function fetchNotification(id: number, signal?: AbortSignal) {
  validateId(id);
  try {
    return await apiRequest<HrmNotification>(`/notifications/${id}`, {
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(notificationError(error));
  }
}
export async function readNotification(id: number, signal?: AbortSignal) {
  validateId(id);
  try {
    return await apiRequest<HrmNotification>(`/notifications/${id}/read`, {
      method: "PATCH",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(notificationError(error));
  }
}
export async function readAllNotifications(signal?: AbortSignal) {
  try {
    return await apiRequest<{ unreadCount: number }>(
      "/notifications/read-all",
      { method: "PATCH", signal },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(notificationError(error));
  }
}
export function announceNotificationChange() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("hrm-notifications-updated"));
}
