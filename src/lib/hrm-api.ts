import { apiRequest, ApiError } from "@/lib/api";

export type PageResult<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
};
export type CatalogReference = { id: number; code: string; name: string };
export type EmployeeReference = {
  id: number;
  employeeCode: string;
  fullName: string;
};
export type EmploymentStatus = "WORKING" | "ON_LEAVE" | "TERMINATED";
export type EmployeeGender = "MALE" | "FEMALE" | "OTHER";
export type EmployeeRecord = EmployeeReference & {
  email: string;
  phone: string;
  hireDate: string;
  employmentStatus: EmploymentStatus;
  dateOfBirth?: string;
  gender?: EmployeeGender;
  address?: string;
  department?: CatalogReference;
  position?: CatalogReference;
  manager?: EmployeeReference;
};
export type CurrentUser = {
  id: number;
  username: string;
  email: string;
  roles: string[];
  employee?: EmployeeRecord;
};
export type CatalogRecord = CatalogReference & {
  description?: string;
  rankLevel?: number;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};
export type AssignmentRecord = {
  id: number;
  employee: EmployeeReference;
  department: CatalogReference;
  position: CatalogReference;
  manager?: EmployeeReference;
  effectiveFrom: string;
  effectiveTo?: string;
  isCurrent: boolean;
  assignedBy?: { accountId: number; username: string };
  createdAt: string;
};
export type EmployeePayload = {
  fullName: string;
  email: string;
  phone: string;
  hireDate: string;
  dateOfBirth?: string;
  gender?: EmployeeGender;
  address?: string;
};
export type Query = Record<string, string | number | undefined>;
export const employmentLabels: Record<EmploymentStatus, string> = {
  WORKING: "Đang làm",
  ON_LEAVE: "Tạm nghỉ",
  TERMINATED: "Nghỉ việc",
};
export const genderLabels: Record<EmployeeGender, string> = {
  MALE: "Nam",
  FEMALE: "Nữ",
  OTHER: "Khác",
};
export const catalogLabels = {
  ACTIVE: "Đang hoạt động",
  INACTIVE: "Vô hiệu hóa",
};
export const roleLabels: Record<string, string> = {
  ADMIN: "Quản trị viên",
  HR: "Nhân sự",
  MANAGER: "Quản lý",
  EMPLOYEE: "Nhân viên",
};

export function canManageHrm(user: CurrentUser | null) {
  return user?.roles.some((role) => role === "ADMIN" || role === "HR") ?? false;
}
export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const payload = error.payload as {
      message?: string;
      errors?: { field: string; message: string }[];
    } | null;
    if (payload?.errors?.length) {
      return payload.errors.map((item) => item.message).join(" ");
    }
    if (payload?.message) return payload.message;
    if (error.status === 403)
      return "Bạn không có quyền thực hiện thao tác này.";
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "Không thể kết nối máy chủ. Vui lòng thử lại.";
}
export function fetchPage<T>(
  path: string,
  params: Query,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim())
      query.set(key, String(value).trim());
  }
  return apiRequest<PageResult<T>>(`${path}?${query}`, { signal });
}
export async function fetchAll<T>(
  path: string,
  params: Query = {},
  signal?: AbortSignal,
) {
  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    signal?.throwIfAborted();
    const result = await fetchPage<T>(
      path,
      { ...params, page, size: 100 },
      signal,
    );
    rows.push(...result.content);
    if (!result.content.length || !result.hasNext) break;
  }
  return rows;
}
export const fetchMyProfile = (signal?: AbortSignal) =>
  apiRequest<CurrentUser>("/me/profile", { signal });
export const updateMyProfile = (payload: { phone: string; address: string }) =>
  apiRequest<CurrentUser>("/me/profile", {
    method: "PUT",
    body: { phone: payload.phone.trim(), address: payload.address.trim() },
  });
export const fetchEmployees = (params: Query, signal?: AbortSignal) =>
  fetchPage<EmployeeRecord>("/employees", params, signal);
export const fetchEmployee = (id: number, signal?: AbortSignal) =>
  apiRequest<EmployeeRecord>(`/employees/${id}`, { signal });
export const saveEmployee = (payload: EmployeePayload, id?: number) =>
  apiRequest<EmployeeRecord>(id ? `/employees/${id}` : "/employees", {
    method: id ? "PATCH" : "POST",
    body: {
      fullName: payload.fullName.trim(),
      email: payload.email.trim(),
      phone: payload.phone.trim(),
      hireDate: payload.hireDate,
      dateOfBirth: payload.dateOfBirth || undefined,
      gender: payload.gender || undefined,
      address: payload.address?.trim(),
    },
  });
export const changeEmployeeStatus = (
  id: number,
  employmentStatus: EmploymentStatus,
  reason: string,
) =>
  apiRequest<unknown>(`/employees/${id}/status`, {
    method: "PATCH",
    body: { employmentStatus, reason: reason.trim() },
  });
export const fetchCatalog = (
  kind: "departments" | "positions",
  params: Query,
  signal?: AbortSignal,
) => fetchPage<CatalogRecord>(`/${kind}`, params, signal);
export const fetchDepartment = (id: number, signal?: AbortSignal) =>
  apiRequest<CatalogRecord>(`/departments/${id}`, { signal });
export const fetchPosition = (id: number, signal?: AbortSignal) =>
  apiRequest<CatalogRecord>(`/positions/${id}`, { signal });
export const saveCatalog = (
  kind: "departments" | "positions",
  payload: {
    name: string;
    description: string;
    code?: string;
    rankLevel?: number;
  },
  id?: number,
) =>
  apiRequest<CatalogRecord>(id ? `/${kind}/${id}` : `/${kind}`, {
    method: id ? "PUT" : "POST",
    body: {
      name: payload.name.trim(),
      description: payload.description.trim(),
      ...(kind === "departments" && !id
        ? { code: payload.code?.trim().toUpperCase() }
        : {}),
      ...(kind === "positions" ? { rankLevel: payload.rankLevel } : {}),
    },
  });
export const changeCatalogStatus = (
  kind: "departments" | "positions",
  id: number,
  status: "ACTIVE" | "INACTIVE",
  reason: string,
) =>
  apiRequest<CatalogRecord>(`/${kind}/${id}/status`, {
    method: "PATCH",
    body: { status, reason: reason.trim() },
  });
export const fetchAssignmentHistory = (
  id: number,
  params: Query,
  signal?: AbortSignal,
) =>
  fetchPage<AssignmentRecord>(`/employees/${id}/assignments`, params, signal);
export const createAssignment = (payload: {
  employeeId: number;
  departmentId: number;
  positionId: number;
  managerEmployeeId?: number;
}) =>
  apiRequest<AssignmentRecord>("/employee-assignments", {
    method: "POST",
    // Omit effectiveFrom: the API assigns its current date and rejects scheduling.
    body: {
      employeeId: payload.employeeId,
      departmentId: payload.departmentId,
      positionId: payload.positionId,
      managerEmployeeId: payload.managerEmployeeId,
    },
  });
export async function fetchAssignmentDirectory(signal?: AbortSignal) {
  const employees = await fetchAll<EmployeeRecord>("/employees", {}, signal);
  const assignments: AssignmentRecord[] = [];
  for (let start = 0; start < employees.length; start += 5) {
    signal?.throwIfAborted();
    const histories = await Promise.all(
      employees
        .slice(start, start + 5)
        .map((employee) =>
          fetchAll<AssignmentRecord>(
            `/employees/${employee.id}/assignments`,
            {},
            signal,
          ),
        ),
    );
    assignments.push(...histories.flat());
  }
  signal?.throwIfAborted();
  assignments.sort(
    (a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id - a.id,
  );
  return { employees, assignments };
}
