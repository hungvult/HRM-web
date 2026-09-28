import { apiRequest } from "@/lib/api";

export type AccountStatus = "ACTIVE" | "LOCKED" | "DISABLED" | "PENDING";

export type Account = {
  id: string;
  employeeId: string;
  username: string;
  employeeCode: string;
  fullName: string;
  initials: string;
  email: string;
  roles: string[];
  department: string;
  position: string;
  status: AccountStatus;
  lastLoginAt: string;
};

export type AccountListParams = {
  keyword?: string;
  status?: AccountStatus;
  page?: number;
  size?: number;
};

export type AccountFormPayload = {
  username: string;
  email: string;
  employeeId: string;
  password?: string;
  status: AccountStatus;
  roles: string[];
};

export type AccountListResult = {
  items: Account[];
  total: number;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function readPath(record: UnknownRecord | null, path: string[]) {
  let current: unknown = record;

  for (const key of path) {
    const next = asRecord(current);
    if (!next) {
      return undefined;
    }
    current = next[key];
  }

  return current;
}

function readString(record: UnknownRecord | null, paths: string[][], fallback = "") {
  for (const path of paths) {
    const value = readPath(record, path);
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return fallback;
}

function readNumber(record: UnknownRecord | null, paths: string[][], fallback = 0) {
  for (const path of paths) {
    const value = readPath(record, path);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

function normalizeStatus(value: unknown): AccountStatus {
  const status = String(value ?? "PENDING").trim().toUpperCase();

  if (status === "ACTIVE" || status === "LOCKED" || status === "DISABLED") {
    return status;
  }

  if (status === "ENABLED") {
    return "ACTIVE";
  }

  return "PENDING";
}

function getInitials(name: string, username: string) {
  const source = name.trim() || username.trim() || "NA";
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toLocaleUpperCase("vi");
  }

  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toLocaleUpperCase("vi");
}

function normalizeRoles(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((role) => {
      if (typeof role === "string") {
        return role;
      }

      const record = asRecord(role);
      return readString(record, [["code"], ["name"]]);
    })
    .filter(Boolean);
}

function extractRows(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = asRecord(payload);
  const data = asRecord(record?.data);

  const candidates = [
    record?.content,
    record?.items,
    record?.users,
    record?.accounts,
    record?.data,
    data?.content,
    data?.items,
    data?.users,
    data?.accounts,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function extractTotal(payload: unknown, rows: unknown[]) {
  const record = asRecord(payload);
  const data = asRecord(record?.data);

  return (
    readNumber(record, [["totalElements"], ["total"], ["totalItems"]], -1) ||
    readNumber(data, [["totalElements"], ["total"], ["totalItems"]], -1) ||
    rows.length
  );
}

export function normalizeAccount(raw: unknown): Account {
  const record = asRecord(raw);
  const employee = asRecord(record?.employee);
  const username = readString(record, [["username"], ["account", "username"]]);
  const fullName = readString(record, [
    ["fullName"],
    ["name"],
    ["employeeName"],
    ["employee", "fullName"],
    ["employee", "name"],
  ], username || "Chưa có hồ sơ");

  const employeeCode = readString(record, [
    ["employeeCode"],
    ["code"],
    ["employee", "employeeCode"],
    ["employee", "code"],
  ], "N/A");

  const roles = normalizeRoles(
    readPath(record, ["roles"]) ??
      readPath(record, ["roleCodes"]) ??
      readPath(record, ["account", "roles"]),
  );

  return {
    id: readString(record, [["id"], ["accountId"], ["userId"]], username || employeeCode),
    employeeId: readString(record, [["employeeId"], ["employee", "id"]]),
    username,
    employeeCode,
    fullName,
    initials: getInitials(fullName, username),
    email: readString(record, [["email"], ["account", "email"], ["employee", "email"]]),
    roles,
    department: readString(record, [
      ["department"],
      ["departmentName"],
      ["employee", "department", "name"],
      ["employee", "department"],
      ["employee", "departmentName"],
      ["employee", "currentAssignment", "departmentName"],
    ], "Chưa phân công"),
    position: readString(employee, [["position", "name"], ["positionName"]]),
    status: normalizeStatus(readPath(record, ["status"]) ?? readPath(record, ["account", "status"])),
    lastLoginAt: readString(record, [["lastLoginAt"], ["lastActiveAt"], ["account", "lastLoginAt"]], "Chưa đăng nhập"),
  };
}

export async function fetchUserAccounts(params: AccountListParams, signal?: AbortSignal) {
  const query = new URLSearchParams();

  if (params.keyword?.trim()) {
    query.set("keyword", params.keyword.trim());
  }

  if (params.status) {
    query.set("status", params.status);
  }

  query.set("page", String(Math.max((params.page ?? 1) - 1, 0)));
  query.set("size", String(params.size ?? 10));

  const payload = await apiRequest<unknown>(`/accounts?${query.toString()}`, { signal });
  const rows = extractRows(payload);
  const accounts = rows.map(normalizeAccount);
  const enriched = await Promise.all(
    accounts.map(async (account) => {
      try {
        return await fetchUserAccount(account.id, signal);
      } catch {
        return account;
      }
    }),
  );

  return {
    items: enriched,
    total: extractTotal(payload, rows),
  } satisfies AccountListResult;
}

export async function fetchUserAccount(id: string, signal?: AbortSignal) {
  const payload = await apiRequest<unknown>(`/accounts/${encodeURIComponent(id)}`, { signal });
  return normalizeAccount(payload);
}

export async function createUserAccount(payload: AccountFormPayload) {
  const employeeId = Number(payload.employeeId);

  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw new Error("Vui lòng nhập employeeId hợp lệ từ hồ sơ nhân viên.");
  }

  return apiRequest<unknown>("/accounts", {
    method: "POST",
    body: {
      username: payload.username,
      email: payload.email,
      password: payload.password,
      roles: payload.roles,
      employeeId,
    },
  });
}

export async function updateUserAccount(id: string, payload: AccountFormPayload) {
  return apiRequest<unknown>(`/accounts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: {
      username: payload.username,
      email: payload.email,
    },
  });
}

export async function updateUserAccountStatus(id: string, status: AccountStatus) {
  return apiRequest<unknown>(`/accounts/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: {
      status,
      reason: status === "ACTIVE" ? "Mở khóa từ màn quản lý tài khoản" : "Cập nhật từ màn quản lý tài khoản",
    },
  });
}

export async function updateUserAccountRoles(id: string, roles: string[]) {
  return apiRequest<unknown>(`/accounts/${encodeURIComponent(id)}/roles`, {
    method: "PUT",
    body: { roles },
  });
}
