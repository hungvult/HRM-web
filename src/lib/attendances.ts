import { ApiError, apiRequest } from "@/lib/api";
import {
  fetchPage,
  type CatalogReference,
  type CurrentUser,
  type Query,
} from "@/lib/hrm-api";
import type { FormErrors } from "@/lib/form-validation";

export const attendanceLabels = {
  PRESENT: "Có mặt",
  LATE: "Đi muộn",
  INCOMPLETE: "Thiếu giờ công",
  ABSENT: "Vắng mặt",
  LEAVE: "Nghỉ phép",
  HOLIDAY: "Ngày lễ",
} as const;
export type AttendanceStatus = keyof typeof attendanceLabels;
export type AttendanceRecord = {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  department?: CatalogReference | null;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workingMinutes: number | null;
  attendanceStatus: AttendanceStatus;
  manuallyAdjusted: boolean;
};
export type AttendanceDetail = AttendanceRecord & {
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
  checkInWifiSsid?: string | null;
  checkOutWifiSsid?: string | null;
  adjustmentReason?: string | null;
  adjustedByAccountId?: number | null;
  createdAt: string;
  updatedAt: string;
};
export type AttendanceHistory = {
  id: number;
  previousCheckInAt: string | null;
  previousCheckOutAt: string | null;
  previousWorkingMinutes: number | null;
  previousAttendanceStatus: AttendanceStatus | null;
  newCheckInAt: string | null;
  newCheckOutAt: string | null;
  newWorkingMinutes: number | null;
  newAttendanceStatus: AttendanceStatus;
  reason: string;
  adjustedByAccountId: number;
  adjustedByUsername: string;
  adjustedAt: string;
};
export type AttendanceValues = {
  employeeId: string;
  workDate: string;
  checkInTime: string;
  checkOutTime: string;
  attendanceStatus: AttendanceStatus;
  reason: string;
};
export type AttendanceMutation = Pick<
  AttendanceRecord,
  | "id"
  | "employeeId"
  | "workDate"
  | "checkInAt"
  | "checkOutAt"
  | "workingMinutes"
  | "attendanceStatus"
  | "manuallyAdjusted"
>;

export const canManageAttendance = (user: CurrentUser | null) =>
  user?.roles.some((role) => ["ADMIN", "HR", "MANAGER"].includes(role)) ??
  false;
export const fetchAttendances = (params: Query, signal?: AbortSignal) =>
  attendanceRead(fetchPage<AttendanceRecord>("/attendances", params, signal));
export const fetchAttendance = (id: number, signal?: AbortSignal) =>
  attendanceRead(
    apiRequest<AttendanceDetail>(`/attendances/${id}`, { signal }),
  );
export const fetchAttendanceHistory = (
  id: number,
  page: number,
  signal?: AbortSignal,
) =>
  attendanceRead(
    fetchPage<AttendanceHistory>(
      `/attendances/${id}/history`,
      { page, size: 8 },
      signal,
    ),
  );

async function attendanceRead<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    throw new Error(attendanceError(error, "load"));
  }
}

const companyZone = "Asia/Ho_Chi_Minh";
export function attendanceDate(value = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: companyZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
export function attendanceTime(value?: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: companyZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
export function attendanceDateTime(value?: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: companyZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
export function attendanceDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "-";
  return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}
export function validAttendanceDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(value + "T00:00:00Z").getTime()) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function validateAttendance(values: AttendanceValues): FormErrors {
  const errors: FormErrors = {};
  const id = Number(values.employeeId);
  if (!values.employeeId.trim() || !Number.isSafeInteger(id) || id <= 0)
    errors.employeeId = "Vui lòng chọn hoặc nhập ID nhân viên hợp lệ.";
  if (!validAttendanceDate(values.workDate))
    errors.workDate = "Vui lòng chọn ngày công hợp lệ.";
  if (!Object.hasOwn(attendanceLabels, values.attendanceStatus))
    errors.attendanceStatus = "Vui lòng chọn trạng thái công hợp lệ.";
  for (const [field, label] of [
    ["checkInTime", "Giờ vào"],
    ["checkOutTime", "Giờ ra"],
  ] as const) {
    if (
      values[field] &&
      !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(values[field])
    )
      errors[field] = `${label} không đúng định dạng.`;
  }
  if (
    !errors.checkInTime &&
    !errors.checkOutTime &&
    values.checkInTime &&
    values.checkOutTime &&
    values.checkOutTime.padEnd(8, ":00") < values.checkInTime.padEnd(8, ":00")
  )
    errors.checkOutTime = "Giờ ra không được trước giờ vào.";
  if (
    Boolean(values.checkInTime) !== Boolean(values.checkOutTime) &&
    values.attendanceStatus !== "INCOMPLETE"
  )
    errors.attendanceStatus =
      "Bản ghi thiếu giờ vào hoặc giờ ra phải chọn trạng thái Thiếu giờ công.";
  if (!values.reason.trim())
    errors.reason = "Vui lòng nhập lý do bổ sung hoặc điều chỉnh công.";
  else if (values.reason.trim().length > 1000)
    errors.reason = "Lý do không được vượt quá 1000 ký tự.";
  return errors;
}
export function attendanceBody(values: AttendanceValues, creating: boolean) {
  // The company uses UTC+07; never interpret input times in the browser's time zone.
  const timestamp = (time: string) =>
    time
      ? `${values.workDate}T${time.length === 5 ? time + ":00" : time}+07:00`
      : null;
  return {
    ...(creating
      ? { employeeId: Number(values.employeeId), workDate: values.workDate }
      : {}),
    checkInAt: timestamp(values.checkInTime),
    checkOutAt: timestamp(values.checkOutTime),
    attendanceStatus: values.attendanceStatus,
    reason: values.reason.trim(),
  };
}
export function saveAttendance(values: AttendanceValues, id?: number) {
  return apiRequest<AttendanceMutation>(
    id ? `/attendances/${id}` : "/attendances",
    {
      method: id ? "PATCH" : "POST",
      body: attendanceBody(values, !id),
    },
  );
}
export function attendanceError(
  error: unknown,
  action: "load" | "save" = "save",
) {
  if (error instanceof ApiError) {
    const payload = error.payload as
      | { code?: string; message?: string }
      | undefined;
    const messages: Record<string, string> = {
      ATTENDANCE_ALREADY_EXISTS:
        "Nhân viên đã có bản ghi công trong ngày này. Hãy mở bản ghi để điều chỉnh.",
      ATTENDANCE_NOT_FOUND:
        "Bản ghi công không còn tồn tại. Vui lòng tải lại danh sách.",
      EMPLOYEE_NOT_FOUND: "Không tìm thấy nhân viên.",
      AUTH_FORBIDDEN_SCOPE:
        "Bạn không có quyền thao tác với bảng công của nhân viên này trong ngày đã chọn.",
    };
    if (payload?.code && messages[payload.code]) return messages[payload.code];
    if (error.status === 403)
      return "Bạn không có quyền quản lý bảng công này.";
    if (
      payload?.message &&
      !/^(Invalid|An unexpected|must|Request)/i.test(payload.message)
    )
      return payload.message;
    return action === "load"
      ? "Không thể tải bảng công từ máy chủ. Vui lòng thử lại."
      : "Không thể lưu bảng công. Vui lòng kiểm tra dữ liệu và thử lại.";
  }
  return "Không thể kết nối máy chủ. Vui lòng thử lại.";
}
