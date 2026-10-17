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
export type LeaveDecision = "APPROVED" | "REJECTED";
export type LeaveReviewResult = {
  id: number;
  requestCode: string;
  status: LeaveDecision;
  reviewedByEmployeeId: number;
  reviewedAt: string;
  remainingDays?: number;
  rejectionReason?: string;
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
    Boolean(user?.roles.some((role) => ["HR", "MANAGER"].includes(role))) &&
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
  if (reason.length > 2000)
    return "Lý do từ chối không được vượt quá 2.000 ký tự.";
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
export function leaveReviewError(error: unknown) {
  if (error instanceof ApiError) {
    const payload = error.payload;
    const code =
      payload && typeof payload === "object" && "code" in payload
        ? String(payload.code)
        : "";
    if (error.status === 401 || error.status === 403 || error.status === 404)
      return leaveError(error);
    if (code === "LEAVE_BALANCE_INSUFFICIENT")
      return "Số dư phép hiện tại không đủ để duyệt đơn này.";
    if (code === "LEAVE_BALANCE_NOT_FOUND")
      return "Chưa có số dư phép của nhân viên cho loại phép và năm của đơn này.";
    if (code === "LEAVE_REQUEST_NOT_PENDING")
      return "Đơn không còn chờ duyệt. Vui lòng tải lại để xem kết quả mới nhất.";
    if (error.status === 409)
      return "Không thể xử lý đơn ở trạng thái hiện tại. Vui lòng tải lại đơn.";
    if (error.status === 400)
      return "Dữ liệu xử lý đơn không hợp lệ. Lý do từ chối phải có từ 1 đến 2.000 ký tự.";
  }
  // A lost response does not prove the transaction failed; never retry a write automatically.
  return "Chưa xác nhận được kết quả xử lý. Vui lòng tải lại đơn trước khi thử lại.";
}
export async function reviewLeaveRequest(
  id: number,
  decision: LeaveDecision,
  reason: string,
  signal?: AbortSignal,
) {
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error("Mã đơn nghỉ phép không hợp lệ.");
  if (decision !== "APPROVED" && decision !== "REJECTED")
    throw new Error("Thao tác xử lý đơn không hợp lệ.");
  if (decision === "REJECTED") {
    const error = validateRejection(reason);
    if (error) throw new Error(error);
  }
  return apiRequest<LeaveReviewResult>(
    `/leave-requests/${id}/${decision === "APPROVED" ? "approve" : "reject"}`,
    {
      method: "POST",
      ...(decision === "REJECTED" ? { body: { reason: reason.trim() } } : {}),
      signal,
    },
  );
}
// The deployed list contract still has no employee or keyword filter.
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
