import type { CurrentUser } from "@/lib/hrm-api";
import type { HrmNotification } from "@/lib/notifications";

export const notificationPreviewUser: CurrentUser = {
  id: 999,
  username: "preview_hr",
  email: "preview@example.invalid",
  roles: ["HR"],
  employee: {
    id: 900,
    employeeCode: "NV-MAU-HR",
    fullName: "Nhân sự mẫu",
    email: "preview@example.invalid",
    phone: "",
    hireDate: "2026-01-01",
    employmentStatus: "WORKING",
  },
};
export function createNotificationPreview(): HrmNotification[] {
  return Array.from({ length: 23 }, (_, index) => {
    const kind = index % 3;
    const read = index % 4 === 3;
    const createdAt = `2026-10-${String(14 - Math.floor(index / 4)).padStart(2, "0")}T${String(15 - (index % 4)).padStart(2, "0")}:20:00+07:00`;
    return {
      id: index + 1,
      type: ["LEAVE_SUBMITTED", "LEAVE_APPROVED", "LEAVE_REJECTED"][kind],
      title: [
        "Có đơn nghỉ phép mới cần xử lý",
        "Đơn nghỉ phép đã được duyệt",
        "Đơn nghỉ phép bị từ chối",
      ][kind],
      content: `Đơn NP-MAU-${String(index + 1).padStart(3, "0")} của Nhân viên mẫu ${String(index + 1).padStart(2, "0")} ${["đang chờ xử lý", "đã được duyệt", "đã bị từ chối"][kind]}.`,
      relatedEntity: { type: "LEAVE_REQUEST", id: index + 1 },
      read,
      readAt: read ? createdAt : null,
      createdAt,
    };
  });
}
