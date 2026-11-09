import { apiRequest, ApiError } from "@/lib/api";
import {
  fetchPage,
  type CatalogReference,
  type CurrentUser,
} from "@/lib/hrm-api";

export type SalaryEmployee = {
  id: number;
  employeeCode: string;
  fullName: string;
  department: CatalogReference | null;
};
export type SalaryProfile = {
  id: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  baseSalary: number;
  allowance: number;
  deduction: number;
};
export type SalaryHistoryItem = SalaryProfile & {
  editable: boolean;
  createdAt: string;
  updatedAt: string;
};
export type SalaryHistory = {
  employee: SalaryEmployee;
  profiles: SalaryHistoryItem[];
};
export type SalaryState = "CURRENT" | "FUTURE" | "HISTORICAL" | "NONE";
export type SalaryEmployeeRow = {
  employee: SalaryEmployee;
  profileState: SalaryState;
  currentProfile: SalaryProfile | null;
};
export const salaryStateLabels: Record<SalaryState, string> = {
  CURRENT: "Đang áp dụng",
  FUTURE: "Chờ hiệu lực",
  HISTORICAL: "Chỉ có lịch sử",
  NONE: "Chưa thiết lập",
};
export type SalaryFilters = {
  q: string;
  departmentId: string;
  profileState: string;
  page: number;
  size: number;
};
export type SalaryFormValues = {
  effectiveFrom: string;
  baseSalary: string;
  allowance: string;
  deduction: string;
};
export type SalaryFormErrors = Partial<
  Record<keyof SalaryFormValues | "employeeId", string>
>;
const root = "/payroll/salary-profiles";
const maxAmount = 999_999_999_999;
export const canManageSalary = (user: CurrentUser | null) =>
  user?.roles.includes("HR") ?? false;
export function formatVnd(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("vi-VN").format(value) + " ₫";
}
export function parseSalaryAmount(value: string) {
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(text)) return NaN;
  const amount = Number(text.replace(/\./g, ""));
  return Number.isSafeInteger(amount) && amount <= maxAmount ? amount : NaN;
}
export function formatSalaryInput(value: string) {
  const amount = parseSalaryAmount(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("vi-VN").format(amount)
    : value;
}
export function validateSalaryForm(
  values: SalaryFormValues,
  employeeId?: number,
): SalaryFormErrors {
  const errors: SalaryFormErrors = {};
  if (!Number.isSafeInteger(employeeId) || !employeeId || employeeId < 1)
    errors.employeeId = "Vui lòng chọn nhân viên.";
  if (
    !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(values.effectiveFrom) ||
    Number(values.effectiveFrom.slice(0, 4)) < 1
  )
    errors.effectiveFrom = "Ngày hiệu lực phải là ngày đầu tháng.";
  const labels = {
    baseSalary: "Lương cơ bản",
    allowance: "Phụ cấp",
    deduction: "Khấu trừ",
  };
  for (const field of ["baseSalary", "allowance", "deduction"] as const) {
    const amount = parseSalaryAmount(values[field]);
    if (!values[field].trim())
      errors[field] = `Vui lòng nhập ${labels[field].toLocaleLowerCase("vi")}.`;
    else if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      (field === "baseSalary" && amount === 0)
    )
      errors[field] =
        `${labels[field]} phải là số VND nguyên ${field === "baseSalary" ? "lớn hơn 0" : "không âm"}, tối đa 999.999.999.999 ₫.`;
  }
  return errors;
}
function requireId(id: number) {
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error("Mã nhân viên hoặc mốc lương không hợp lệ.");
}
export function fetchSalaryEmployees(
  filters: SalaryFilters,
  signal?: AbortSignal,
) {
  return fetchPage<SalaryEmployeeRow>(
    `${root}/employees`,
    { ...filters, q: filters.q.trim() },
    signal,
  );
}
export function fetchSalaryHistory(employeeId: number, signal?: AbortSignal) {
  requireId(employeeId);
  return apiRequest<SalaryHistory>(`${root}/employees/${employeeId}`, {
    signal,
  });
}
export function saveSalaryProfile(
  employeeId: number,
  values: SalaryFormValues,
  profileId?: number,
  signal?: AbortSignal,
) {
  requireId(employeeId);
  if (profileId !== undefined) requireId(profileId);
  const errors = validateSalaryForm(values, employeeId);
  if (Object.keys(errors).length)
    throw new Error(Object.values(errors).join(" "));
  return apiRequest<SalaryHistoryItem>(
    profileId === undefined ? root : `${root}/${profileId}`,
    {
      method: profileId === undefined ? "POST" : "PUT",
      signal,
      body: {
        ...(profileId === undefined ? { employeeId } : {}),
        effectiveFrom: values.effectiveFrom,
        baseSalary: parseSalaryAmount(values.baseSalary),
        allowance: parseSalaryAmount(values.allowance),
        deduction: parseSalaryAmount(values.deduction),
      },
    },
  );
}
export function salaryErrorCode(error: unknown) {
  return error instanceof ApiError &&
    error.payload &&
    typeof error.payload === "object" &&
    "code" in error.payload
    ? String(error.payload.code)
    : "";
}
export function salaryErrorMessage(error: unknown, writing = false) {
  const code = salaryErrorCode(error);
  if (code === "SALARY_PROFILE_LOCKED")
    return "Mốc lương đã được dùng để tính lương và không thể sửa. Hãy tải lại lịch sử hoặc thêm mốc lương mới.";
  if (code === "SALARY_PROFILE_OVERLAP")
    return "Đã có mốc lương trong tháng này. Vui lòng chọn tháng khác hoặc cập nhật mốc được phép sửa.";
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403)
      return "Chỉ nhân sự (HR) được quản lý thông tin lương. Vui lòng kiểm tra lại quyền truy cập.";
    if (error.status === 404)
      return "Không tìm thấy nhân viên hoặc mốc lương. Vui lòng tải lại danh sách.";
    if ([400, 422].includes(error.status))
      return "Thông tin lương chưa hợp lệ. Kiểm tra số tiền và ngày hiệu lực đầu tháng.";
    if (error.status === 409)
      return "Dữ liệu lương đã thay đổi hoặc mốc hiệu lực bị trùng. Vui lòng tải lại lịch sử trước khi lưu.";
  }
  return writing
    ? "Chưa xác nhận được kết quả lưu. Vui lòng tải lại lịch sử trước khi thử lại."
    : "Không thể tải thông tin lương. Vui lòng thử lại.";
}
export function salaryFieldErrors(error: unknown): SalaryFormErrors {
  const result: SalaryFormErrors = {};
  const code = salaryErrorCode(error);
  if (
    [
      "SALARY_PROFILE_OVERLAP",
      "SALARY_PROFILE_EFFECTIVE_DATE_INVALID",
    ].includes(code)
  )
    result.effectiveFrom =
      code === "SALARY_PROFILE_OVERLAP"
        ? "Tháng này đã có mốc lương."
        : "Ngày hiệu lực phải là ngày đầu tháng.";
  if (
    error instanceof ApiError &&
    error.payload &&
    typeof error.payload === "object" &&
    "errors" in error.payload &&
    Array.isArray(error.payload.errors)
  ) {
    for (const item of error.payload.errors) {
      const field = item?.field as keyof SalaryFormErrors;
      if (["baseSalary", "allowance", "deduction"].includes(field))
        result[field] =
          "Số tiền phải là VND nguyên, trong giới hạn; lương cơ bản lớn hơn 0, các khoản khác không âm.";
      else if (field === "effectiveFrom")
        result[field] =
          "Ngày hiệu lực phải là ngày đầu tháng và không trùng mốc đã có.";
      else if (field === "employeeId")
        result[field] = "Vui lòng chọn nhân viên hợp lệ.";
    }
  }
  return result;
}
