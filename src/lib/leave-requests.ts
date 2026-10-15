import { apiRequest, ApiError } from "@/lib/api";
import { fetchPage, type CurrentUser } from "@/lib/hrm-api";

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type LeaveHistory = {
  oldStatus: string | null;
  newStatus: string;
  changedByEmployeeId: number | null;
  changedByEmployeeName: string | null;
  changedAt: string;
  note: string | null;
};
export type LeaveRecord = {
  id: number;
  requestCode: string;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  leaveTypeId: number;
  leaveTypeCode: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  requestedDays: number;
  status: LeaveStatus;
  createdAt: string;
};
export type LeaveDetail = LeaveRecord & {
  reason: string;
  reviewedByEmployeeId: number | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  statusHistory: LeaveHistory[];
};
export type LeaveFilters = {
  status: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  page: number;
  size: number;
};
export const leaveLabels: Record<LeaveStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy",
};
export const leaveTypes = [
  { id: 1, code: "ANNUAL", name: "Nghỉ phép năm" },
  { id: 2, code: "UNPAID", name: "Nghỉ không lương" },
  { id: 3, code: "SICK", name: "Nghỉ ốm" },
];
export function canManageLeave(user: CurrentUser | null) {
  return (
    user?.roles.some((role) => ["ADMIN", "HR", "MANAGER"].includes(role)) ??
    false
  );
}
export function canReviewLeave(user: CurrentUser | null, record: LeaveRecord) {
  return (
    canManageLeave(user) &&
    Boolean(user?.employee?.id) &&
    user!.employee!.id !== record.employeeId &&
    record.status === "PENDING"
  );
}
export function leaveStatusLabel(status: string) {
  return Object.hasOwn(leaveLabels, status)
    ? leaveLabels[status as LeaveStatus]
    : "Không xác định";
}
export function leaveDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}
export function validateLeaveFilters(filters: LeaveFilters) {
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate)
    return "Từ ngày không được sau đến ngày.";
  return "";
}
export function validateRejection(reason: string) {
  if (!reason.trim()) return "Vui lòng nhập lý do từ chối.";
  if (reason.trim().length > 1000)
    return "Lý do từ chối không được vượt quá 1.000 ký tự.";
  return "";
}
export function leaveError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403)
      return "Bạn không còn quyền xem hoặc xử lý đơn nghỉ phép này.";
    if (error.status === 404)
      return "Không tìm thấy đơn nghỉ phép hoặc đơn không còn khả dụng.";
    if (error.status === 409)
      return "Đơn đã được người khác xử lý. Vui lòng tải lại để xem trạng thái mới nhất.";
  }
  return "Không thể tải đơn nghỉ phép. Vui lòng thử lại.";
}
// Only parameters supported by backend PR #69 are sent; employee search is not yet supported.
export async function fetchLeaveRequests(
  filters: LeaveFilters,
  signal?: AbortSignal,
) {
  try {
    return await fetchPage<LeaveRecord>(
      "/leave-requests",
      {
        status: filters.status,
        leaveTypeId: filters.leaveTypeId,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        page: filters.page,
        size: filters.size,
      },
      signal,
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(leaveError(error));
  }
}
export async function fetchLeaveTypes(signal?: AbortSignal) {
  try {
    return await apiRequest<Array<{ id: number; code: string; name: string }>>(
      "/leave-types",
      { signal },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Không thể tải loại phép. Vui lòng thử lại.");
  }
}
export async function fetchLeaveDetail(id: number, signal?: AbortSignal) {
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error("Mã đơn nghỉ phép không hợp lệ.");
  try {
    return await apiRequest<LeaveDetail>(`/leave-requests/${id}`, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(leaveError(error));
  }
}
