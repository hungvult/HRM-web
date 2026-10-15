import type { CurrentUser } from "@/lib/hrm-api";
import type {
  LeaveDetail,
  LeaveFilters,
  LeaveStatus,
} from "@/lib/leave-requests";
import { matchesSearch } from "@/lib/hrm-format";

export function previewLeaveUser(role = "HR"): CurrentUser {
  return {
    id: 999,
    username: "preview_hr",
    email: "preview@example.invalid",
    roles: [role],
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
}
// Fictional fixtures used only when the server explicitly allows development preview.
export function createLeavePreview(): LeaveDetail[] {
  return Array.from({ length: 24 }, (_, index) => {
    const status: LeaveStatus = [
      "PENDING",
      "PENDING",
      "APPROVED",
      "REJECTED",
      "CANCELLED",
    ][index % 5] as LeaveStatus;
    const day = String(15 + (index % 12)).padStart(2, "0");
    const createdAt = `2026-10-${String(14 - Math.floor(index / 4)).padStart(2, "0")}T08:30:00+07:00`;
    const updatedAt =
      status === "PENDING" ? createdAt : "2026-10-14T09:00:00+07:00";
    const employeeId = index === 1 ? 900 : 901 + index;
    return {
      id: index + 1,
      requestCode: `NP-MAU-${String(index + 1).padStart(3, "0")}`,
      employeeId,
      employeeCode: `NV-MAU-${String(employeeId).slice(-3)}`,
      employeeName:
        employeeId === 900
          ? "Nhân sự mẫu"
          : `Nhân viên mẫu ${String(index + 1).padStart(2, "0")}`,
      leaveTypeId: (index % 3) + 1,
      leaveTypeCode: ["ANNUAL", "UNPAID", "SICK"][index % 3],
      leaveTypeName: ["Nghỉ phép năm", "Nghỉ không lương", "Nghỉ ốm"][
        index % 3
      ],
      startDate: `2026-10-${day}`,
      endDate: `2026-10-${day}`,
      requestedDays: index % 4 === 0 ? 0.5 : 1,
      reason:
        "Xin nghỉ để giải quyết công việc cá nhân. Đã bàn giao công việc cho đồng nghiệp.",
      status,
      createdAt,
      updatedAt,
      reviewedByEmployeeId: ["APPROVED", "REJECTED"].includes(status)
        ? 900
        : null,
      reviewedAt: ["APPROVED", "REJECTED"].includes(status) ? updatedAt : null,
      rejectionReason:
        status === "REJECTED"
          ? "Cần điều chỉnh lịch nghỉ để bảo đảm công việc."
          : null,
      cancelledAt: status === "CANCELLED" ? updatedAt : null,
      statusHistory: [
        {
          oldStatus: null,
          newStatus: "PENDING",
          changedByEmployeeId: employeeId,
          changedByEmployeeName: "Nhân viên mẫu",
          changedAt: createdAt,
          note: "Gửi đơn nghỉ phép",
        },
        ...(status === "PENDING"
          ? []
          : [
              {
                oldStatus: "PENDING",
                newStatus: status,
                changedByEmployeeId: 900,
                changedByEmployeeName: "Nhân sự mẫu",
                changedAt: updatedAt,
                note:
                  status === "REJECTED"
                    ? "Cần điều chỉnh lịch nghỉ để bảo đảm công việc."
                    : "Đã xử lý đơn",
              },
            ]),
      ],
    };
  });
}
export function filterLeavePreview(
  records: LeaveDetail[],
  filters: LeaveFilters,
  query: string,
) {
  return records.filter(
    (record) =>
      (!filters.status || record.status === filters.status) &&
      (!filters.leaveTypeId ||
        String(record.leaveTypeId) === filters.leaveTypeId) &&
      (!filters.fromDate || record.endDate >= filters.fromDate) &&
      (!filters.toDate || record.startDate <= filters.toDate) &&
      matchesSearch(query, [
        record.requestCode,
        record.employeeCode,
        record.employeeName,
      ]),
  );
}
