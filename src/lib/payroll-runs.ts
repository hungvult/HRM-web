import { apiRequest, ApiError } from "@/lib/api";
import {
  fetchPage,
  type CatalogReference,
  type PageResult,
} from "@/lib/hrm-api";

export type PayrollStatus = "GENERATED" | "PUBLISHED";
export const payrollStatusLabels: Record<PayrollStatus, string> = {
  GENERATED: "Đã tạo",
  PUBLISHED: "Đã công bố",
};
export type PayrollPeriod = { year: number; month: number };
export type PayrollAccount = {
  id: number;
  username: string;
  displayName: string | null;
};
export type PayrollWork = {
  standardWorkingDays: number | null;
  standardMinutesPerDay: number | null;
  paidMinutes: number | null;
  paidWorkingDays: number | null;
};
export type PayrollAmounts = {
  baseSalaryMonthly: number | null;
  allowanceMonthly: number | null;
  deductionMonthly: number | null;
  earnedBaseSalary: number | null;
  earnedAllowance: number | null;
  earnedDeduction: number | null;
  netSalary: number | null;
};
export type PayrollSummary = {
  employeeCount: number;
  totalEarnedBaseSalary: number;
  totalEarnedAllowance: number;
  totalEarnedDeduction: number;
  totalNetSalary: number;
};
export type PayrollEmployee = {
  id: number;
  employeeCode: string;
  fullName: string;
  department: CatalogReference | null;
};
export type PayrollItem = {
  id?: number;
  employee: PayrollEmployee;
  work: PayrollWork;
  amounts: PayrollAmounts;
  salaryProfileId: number | null;
};
export type PayrollRunRow = {
  id: number;
  period: PayrollPeriod;
  status: PayrollStatus;
  employeeCount: number;
  totalNetSalary: number;
  generatedBy: PayrollAccount | null;
  generatedAt: string;
  publishedBy: PayrollAccount | null;
  publishedAt: string | null;
};
export type PayrollRun = Omit<
  PayrollRunRow,
  "employeeCount" | "totalNetSalary"
> & {
  workStandard: Pick<
    PayrollWork,
    "standardWorkingDays" | "standardMinutesPerDay"
  >;
  summary: PayrollSummary;
};
export type PayrollItemPage = PageResult<PayrollItem> & {
  filteredSummary: PayrollSummary;
};
export type PayrollPreview = PayrollPeriod & {
  previewToken: string;
  expiresAt: string;
  periodClosed: boolean;
  status: string;
  canConfirm: boolean;
  workStandard: PayrollWork;
  summary: PayrollSummary;
  items: PayrollItem[];
  issues: {
    severity: string;
    code: string;
    employee?: PayrollEmployee | null;
    date?: string | null;
    field?: string | null;
    message: string;
  }[];
};
// Write responses have a flat period; the read APIs return a nested period.
export type PayrollWriteResult = PayrollPeriod & {
  id: number;
  status: PayrollStatus;
};
export type PayrollFilters = {
  period: string;
  status: string;
  page: number;
  size: number;
};
export type PayrollItemFilters = {
  q: string;
  departmentId: string;
  page: number;
  size: number;
};

export function parsePayrollPeriod(value: string): PayrollPeriod | null {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5)) };
}
export function periodLabel(period: PayrollPeriod) {
  return `${String(period.month).padStart(2, "0")}/${period.year}`;
}
export function lastClosedMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}
export function canConfirmPayroll(
  preview: PayrollPreview | null,
  period: string,
  now = Date.now(),
) {
  const selected = parsePayrollPeriod(period);
  return Boolean(
    preview &&
    selected &&
    preview.year === selected.year &&
    preview.month === selected.month &&
    preview.previewToken &&
    preview.periodClosed &&
    preview.canConfirm &&
    !preview.issues.some((issue) => issue.severity.toUpperCase() === "ERROR") &&
    Number.isFinite(Date.parse(preview.expiresAt)) &&
    Date.parse(preview.expiresAt) > now,
  );
}
function validId(id: number) {
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error("Mã bảng lương không hợp lệ.");
  return id;
}
export const fetchPayrollRuns = (
  filters: PayrollFilters,
  signal?: AbortSignal,
) => {
  const period = filters.period ? parsePayrollPeriod(filters.period) : null;
  if (filters.period && !period)
    throw new Error("Vui lòng chọn kỳ lương hợp lệ.");
  return fetchPage<PayrollRunRow>(
    "/payroll/runs",
    {
      ...period,
      status: filters.status || undefined,
      page: filters.page,
      size: filters.size,
    },
    signal,
  );
};
export const fetchPayrollRun = (id: number, signal?: AbortSignal) =>
  apiRequest<PayrollRun>(`/payroll/runs/${validId(id)}`, { signal });
export function fetchPayrollItems(
  id: number,
  filters: PayrollItemFilters,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    page: String(filters.page),
    size: String(filters.size),
  });
  if (filters.q.trim()) query.set("q", filters.q.trim().slice(0, 100));
  if (filters.departmentId) query.set("departmentId", filters.departmentId);
  return apiRequest<PayrollItemPage>(
    `/payroll/runs/${validId(id)}/items?${query}`,
    { signal },
  );
}
export function previewPayroll(period: string, signal?: AbortSignal) {
  const body = parsePayrollPeriod(period);
  if (!body) throw new Error("Vui lòng chọn kỳ lương hợp lệ.");
  return apiRequest<PayrollPreview>("/payroll/previews", {
    method: "POST",
    body,
    signal,
  });
}
export function confirmPayroll(previewToken: string, signal?: AbortSignal) {
  if (!previewToken.trim())
    throw new Error("Vui lòng xem trước bảng lương trước khi tạo.");
  return apiRequest<PayrollWriteResult>("/payroll/runs", {
    method: "POST",
    body: { previewToken },
    signal,
  });
}
export const publishPayroll = (id: number, signal?: AbortSignal) =>
  apiRequest<PayrollWriteResult>(`/payroll/runs/${validId(id)}/publish`, {
    method: "POST",
    signal,
  });

export function payrollErrorMessage(error: unknown, writing = false) {
  if (error instanceof ApiError) {
    const code = (error.payload as { code?: string } | null)?.code;
    const messages: Record<string, string> = {
      PAYROLL_PREVIEW_STALE:
        "Dữ liệu đầu vào đã thay đổi. Vui lòng xem trước lại trước khi tạo bảng lương.",
      PAYROLL_PREVIEW_EXPIRED:
        "Bản xem trước đã hết hạn. Vui lòng xem trước lại.",
      PAYROLL_PREVIEW_ALREADY_USED:
        "Bản xem trước không còn khả dụng. Hãy kiểm tra danh sách bảng lương rồi xem trước lại nếu cần.",
      PAYROLL_PERIOD_EXISTS:
        "Kỳ này đã có bảng lương. Vui lòng kiểm tra danh sách, không tạo lại.",
      PAYROLL_PERIOD_FUTURE: "Không thể tạo bảng lương cho kỳ trong tương lai.",
      PAYROLL_PERIOD_NOT_CLOSED:
        "Kỳ lương chưa kết thúc. Vui lòng chọn kỳ đã chốt.",
      PAYROLL_INPUT_MISSING:
        "Dữ liệu tính lương chưa đầy đủ. Vui lòng kiểm tra và xem trước lại.",
      PAYROLL_RUN_NOT_FOUND:
        "Không tìm thấy bảng lương. Vui lòng tải lại danh sách.",
      PAYROLL_RUN_STATE_CONFLICT:
        "Trạng thái bảng lương đã thay đổi. Vui lòng tải lại để kiểm tra.",
    };
    if (code && messages[code]) return messages[code];
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403)
      return "Chỉ nhân sự (HR) được quản lý bảng lương.";
    if (error.status < 500)
      return "Yêu cầu chưa hợp lệ. Vui lòng kiểm tra kỳ lương và dữ liệu đầu vào.";
  }
  return writing
    ? "Chưa xác định được kết quả thao tác. Hãy kiểm tra lại danh sách hoặc chi tiết bảng lương trước khi thực hiện tiếp."
    : "Không thể tải dữ liệu bảng lương. Vui lòng thử lại.";
}
