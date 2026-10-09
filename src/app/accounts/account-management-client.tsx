"use client";

import {
  BarChart3,
  Clock3,
  LoaderCircle,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/lib/api";
import {
  Account,
  AccountFormPayload,
  AccountStatus,
  createUserAccount,
  fetchUserAccounts,
  updateUserAccount,
  updateUserAccountRoles,
  updateUserAccountStatus,
} from "@/lib/accounts";
import HrmAppShell from "@/components/hrm-app-shell";
import { fetchMyProfile } from "@/lib/hrm-api";
import { useApiResource } from "@/lib/use-api-resource";
import {
  FilterBar,
  ListCard,
  RowActions,
  StatisticSummary,
  TableFooter,
} from "@/components/hrm-ui";

const pageSize = 8;

const statusCopy: Record<AccountStatus, string> = {
  ACTIVE: "Đang hoạt động",
  LOCKED: "Đã khóa",
  DISABLED: "Vô hiệu hóa",
  PENDING: "Chờ kích hoạt",
};

const roleCopy: Record<string, string> = {
  ADMIN: "Quản trị viên",
  HR: "HR",
  MANAGER: "Quản lý",
  EMPLOYEE: "Nhân viên",
};

const roleOptions = [
  { value: "ADMIN", label: "Quản trị viên" },
  { value: "HR", label: "HR" },
  { value: "MANAGER", label: "Quản lý" },
  { value: "EMPLOYEE", label: "Nhân viên" },
];

const passwordRules = [
  "Ít nhất 8 ký tự",
  "Có chữ hoa và chữ thường",
  "Có ít nhất 1 số",
  "Có ký tự đặc biệt",
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AccountFormField = "username" | "email" | "employeeId" | "roles" | "password";

type AccountFormValues = {
  username: string;
  email: string;
  employeeId: string;
  password: string;
  roles: string[];
};

type AccountFieldErrors = Partial<Record<AccountFormField, string>>;

function joinClass(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatLastLogin(value: string) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return value || "Chưa đăng nhập";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getLastLoginInfo(value: string) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return {
      label: "Chưa đăng nhập",
      detail: "Chưa có phiên hoạt động",
      tone: "idle" as const,
    };
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  const relativeFormatter = new Intl.RelativeTimeFormat("vi-VN", { numeric: "auto" });
  let label = "Vừa xong";

  if (diffMinutes >= 1 && diffMinutes < 60) {
    label = relativeFormatter.format(-diffMinutes, "minute");
  } else if (diffMinutes >= 60 && diffMinutes < 1440) {
    label = relativeFormatter.format(-Math.round(diffMinutes / 60), "hour");
  } else if (diffMinutes >= 1440 && diffMinutes < 43200) {
    label = relativeFormatter.format(-Math.round(diffMinutes / 1440), "day");
  } else if (diffMinutes >= 43200) {
    label = formatLastLogin(value);
  }

  return {
    label,
    detail: formatLastLogin(value),
    tone: diffMinutes <= 1440 ? ("recent" as const) : ("old" as const),
  };
}

function validatePassword(password: string) {
  if (password.length < 8) {
    return "Mật khẩu cần có ít nhất 8 ký tự.";
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return "Mật khẩu cần có cả chữ hoa và chữ thường.";
  }

  if (!/\d/.test(password)) {
    return "Mật khẩu cần có ít nhất 1 số.";
  }

  if (!/[^\da-z]/i.test(password)) {
    return "Mật khẩu cần có ít nhất 1 ký tự đặc biệt.";
  }

  return "";
}

function readAccountFormValues(form: HTMLFormElement): AccountFormValues {
  const formData = new FormData(form);

  return {
    username: String(formData.get("username") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    employeeId: String(formData.get("employeeId") ?? "").trim(),
    password: String(formData.get("password") ?? "").trim(),
    roles: formData.getAll("roles").map(String).filter(Boolean),
  };
}

function validateAccountForm(values: AccountFormValues, isEditing: boolean): AccountFieldErrors {
  const errors: AccountFieldErrors = {};

  if (!values.username) {
    errors.username = "Vui lòng nhập tên đăng nhập.";
  } else if (values.username.length < 3) {
    errors.username = "Tên đăng nhập cần có ít nhất 3 ký tự.";
  } else if (/\s/.test(values.username)) {
    errors.username = "Tên đăng nhập không được chứa khoảng trắng.";
  }

  if (!values.email) {
    errors.email = "Vui lòng nhập email.";
  } else if (!emailPattern.test(values.email)) {
    errors.email = "Email chưa đúng định dạng.";
  }

  if (!isEditing) {
    const employeeId = Number(values.employeeId);

    if (!values.employeeId) {
      errors.employeeId = "Vui lòng nhập ID hồ sơ nhân viên.";
    } else if (!Number.isInteger(employeeId) || employeeId <= 0) {
      errors.employeeId = "ID hồ sơ nhân viên phải là số nguyên dương.";
    }

    const passwordError = validatePassword(values.password);

    if (passwordError) {
      errors.password = passwordError;
    }
  }

  if (values.roles.length === 0) {
    errors.roles = "Vui lòng chọn ít nhất một vai trò.";
  }

  return errors;
}

function hasFieldErrors(errors: AccountFieldErrors) {
  return Object.values(errors).some(Boolean);
}

function resolveAccountSaveMessage(error: unknown, isEditing: boolean) {
  if (!(error instanceof ApiError)) {
    return "Không thể lưu tài khoản. Vui lòng kiểm tra thông tin và thử lại.";
  }

  if (error.status === 400) {
    return "Thông tin tài khoản chưa hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.";
  }

  if (error.status === 401) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }

  if (error.status === 403) {
    return "Tài khoản hiện tại không có quyền thực hiện thao tác này.";
  }

  if (error.status === 404) {
    return isEditing
      ? "Không tìm thấy tài khoản cần cập nhật."
      : "Không tìm thấy hồ sơ nhân viên. Hãy nhập đúng ID hồ sơ nhân viên đã tồn tại.";
  }

  if (error.status === 409) {
    return error.message.trim() || "Tên đăng nhập, email hoặc hồ sơ nhân viên này đã được dùng cho tài khoản khác.";
  }

  return "Không thể lưu tài khoản. Vui lòng thử lại sau.";
}

function resolveStatusUpdateMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    }

    if (error.status === 403) {
      return "Tài khoản hiện tại không có quyền cập nhật trạng thái.";
    }

    if (error.status === 404) {
      return "Không tìm thấy tài khoản cần cập nhật trạng thái.";
    }
  }

  return "Không thể cập nhật trạng thái tài khoản. Vui lòng thử lại.";
}

export default function AccountManagementPage() {
  const session = useApiResource(fetchMyProfile);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | AccountStatus>("ALL");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const allVisibleSelected =
    accounts.length > 0 && accounts.every((account) => selectedIds.includes(account.id));

  const stats = useMemo(() => {
    const active = accounts.filter((account) => account.status === "ACTIVE").length;
    const locked = accounts.filter((account) => account.status === "LOCKED").length;
    const disabled = accounts.filter((account) => account.status === "DISABLED").length;

    return [
      { label: "Tổng tài khoản", value: String(total), detail: "Tài khoản trong hệ thống", icon: Users },
      { label: "Đang hoạt động", value: String(active), detail: "Sẵn sàng sử dụng", icon: ShieldCheck },
      { label: "Vô hiệu hóa", value: String(disabled), detail: "Đã tạm ngưng", icon: Clock3 },
      { label: "Đã khóa", value: String(locked), detail: "Cần quản trị viên mở khóa", icon: BarChart3 },
    ];
  }, [accounts, total]);

  useEffect(() => {
    const controller = new AbortController();

    fetchUserAccounts(
      {
        keyword: query,
        status: status === "ALL" ? undefined : status,
        page,
        size: pageSize,
      },
      controller.signal,
    )
      .then((result) => {
        setAccounts(result.items);
        setTotal(result.total);
        setSelectedIds([]);
      })
      .catch((apiError: unknown) => {
        if (apiError instanceof DOMException && apiError.name === "AbortError") {
          return;
        }

        setAccounts([]);
        setTotal(0);
        setError("Không thể tải danh sách tài khoản. Vui lòng thử lại sau.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [page, query, reloadKey, status]);

  function prepareFetch() {
    setIsLoading(true);
    setError("");
  }

  function reloadAccounts(message?: string) {
    prepareFetch();
    if (message) {
      setNotice(message);
    }
    setReloadKey((current) => current + 1);
  }

  function togglePageSelection() {
    const visibleIds = accounts.map((account) => account.id);
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    );
  }

  function openCreateForm() {
    setEditingAccount(null);
    setFormOpen(true);
    setNotice("");
  }

  function openEditForm(account: Account) {
    setEditingAccount(account);
    setFormOpen(true);
    setNotice("");
  }

  async function handleSubmitAccount(payload: AccountFormPayload) {
    setIsSaving(true);
    setNotice("");

    try {
      if (editingAccount) {
        await updateUserAccount(editingAccount.id, payload);
        await updateUserAccountRoles(editingAccount.id, payload.roles);
        reloadAccounts("Đã cập nhật tài khoản.");
      } else {
        await createUserAccount(payload);
        setPage(1);
        reloadAccounts("Đã tạo tài khoản mới.");
      }

      setFormOpen(false);
      setEditingAccount(null);
    } catch (apiError) {
      const message = resolveAccountSaveMessage(apiError, Boolean(editingAccount));

      setNotice(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleStatus(account: Account) {
    const nextStatus: AccountStatus = account.status === "ACTIVE" ? "LOCKED" : "ACTIVE";
    setNotice("");

    try {
      await updateUserAccountStatus(account.id, nextStatus);
      reloadAccounts(
        nextStatus === "LOCKED"
          ? `Đã khóa tài khoản ${account.username || account.email}.`
          : `Đã mở khóa tài khoản ${account.username || account.email}.`,
      );
    } catch (apiError) {
      setNotice(resolveStatusUpdateMessage(apiError));
    }
  }

  return (
    <HrmAppShell
      user={session.data}
      activeLabel="Quản lý tài khoản"
      title="Quản lý tài khoản"
      description="Kiểm soát quyền truy cập, trạng thái và vai trò người dùng"
      actionLabel="Thêm tài khoản"
      onAction={openCreateForm}
    >
      <StatisticSummary items={stats} />

      <ListCard
        title="Danh sách tài khoản"
        titleId="account-table-title"
        description="Quản lý người dùng, vai trò và trạng thái truy cập"
        actions={
          <FilterBar
            query={query}
            onQuery={(value) => {
              prepareFetch();
              setQuery(value);
              setPage(1);
            }}
            placeholder="Tìm kiếm tài khoản"
            filters={[
              {
                label: "Mọi trạng thái",
                value: status === "ALL" ? "" : statusCopy[status],
                options: ["Đang hoạt động", "Đã khóa", "Vô hiệu hóa"],
                onChange: (value) => {
                  prepareFetch();
                  setStatus(
                    (Object.entries(statusCopy).find(
                      ([, label]) => label === value,
                    )?.[0] as AccountStatus) || "ALL",
                  );
                  setPage(1);
                },
              },
            ]}
            onReload={() => reloadAccounts("Đã tải lại danh sách tài khoản.")}
          />
        }
        footer={
          <TableFooter
            total={total}
            page={page}
            pageSize={pageSize}
            onPage={(number) => {
              prepareFetch();
              setPage(number);
            }}
          />
        }
      >
        {selectedIds.length > 0 ? (
          <div className="flex items-center justify-between border-b border-border bg-accent/60 px-4 py-2 text-xs">
            <span className="font-medium text-primary">
              Đã chọn {selectedIds.length} tài khoản
            </span>
            <button
              type="button"
              className="rounded-md px-2 py-1 font-medium hover:bg-background"
              onClick={() => setSelectedIds([])}
            >
              Bỏ chọn
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="border-b border-border bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-muted/55 text-[0.68rem] uppercase text-muted-foreground">
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={togglePageSelection}
                    aria-label="Chọn tất cả tài khoản trên trang"
                    className="size-4 rounded border-input accent-primary"
                  />
                </th>
                <th className="w-[260px] px-3 py-3 font-semibold">Nhân viên</th>
                <th className="w-[250px] px-3 py-3 font-semibold">Tài khoản</th>
                <th className="w-[170px] px-3 py-3 font-semibold">Vai trò</th>
                <th className="w-[190px] px-3 py-3 font-semibold">Phòng ban</th>
                <th className="w-[150px] px-3 py-3 font-semibold whitespace-nowrap">
                  Trạng thái
                </th>
                <th className="w-[180px] px-3 py-3 font-semibold whitespace-nowrap">
                  Hoạt động gần nhất
                </th>
                <th className="w-40 px-3 py-3 text-right font-semibold">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-16 text-center text-sm text-muted-foreground"
                  >
                    <LoaderCircle className="mx-auto mb-3 size-7 animate-spin" />
                    Đang tải danh sách tài khoản...
                  </td>
                </tr>
              ) : null}

              {!isLoading && accounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <Search className="mx-auto mb-3 size-7 text-muted-foreground" />
                    <p className="font-semibold">Không tìm thấy tài khoản</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Thử đổi từ khóa hoặc bộ lọc trạng thái.
                    </p>
                  </td>
                </tr>
              ) : null}

              {!isLoading
                ? accounts.map((account) => (
                    <tr
                      key={account.id}
                      className="border-b border-border/70 transition-colors last:border-0 hover:bg-primary/5"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(account.id)}
                          onChange={() =>
                            setSelectedIds((current) =>
                              current.includes(account.id)
                                ? current.filter((id) => id !== account.id)
                                : [...current, account.id],
                            )
                          }
                          aria-label={`Chọn ${account.fullName}`}
                          className="size-4 rounded border-input accent-primary"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/10">
                            {account.initials}
                          </span>
                          <div>
                            <p className="text-sm font-semibold">
                              {account.fullName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {account.employeeCode}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-medium">
                          {account.username || "Chưa cập nhật"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {account.email}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <RoleTags roles={account.roles} />
                      </td>
                      <td className="px-3 py-3 text-sm text-muted-foreground">
                        <p>{account.department}</p>
                        {account.position ? (
                          <p className="text-[0.68rem]">{account.position}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <StatusBadge status={account.status} />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <LastLoginCell value={account.lastLoginAt} />
                      </td>
                      <td className="px-3 py-3">
                        <RowActions
                          name={account.fullName}
                          onEdit={() => openEditForm(account)}
                          onStatus={() => void handleToggleStatus(account)}
                          statusLabel={
                            account.status === "ACTIVE" ? "Khóa" : "Mở khóa"
                          }
                        />
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </ListCard>

      <p
        role="status"
        aria-live="polite"
        className="min-h-5 text-center text-xs text-muted-foreground"
      >
        {notice}
      </p>
      {formOpen ? (
        <AccountFormDialog
          key={editingAccount?.id ?? "create"}
          account={editingAccount}
          isOpen={formOpen}
          isSaving={isSaving}
          onClose={() => {
            if (!isSaving) {
              setFormOpen(false);
              setEditingAccount(null);
            }
          }}
          onSubmit={handleSubmitAccount}
        />
      ) : null}
    </HrmAppShell>
  );
}

function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span
      className={joinClass(
        "inline-flex min-w-[7.75rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[0.68rem] font-semibold leading-none",
        status === "ACTIVE" && "bg-success/12 text-success ring-1 ring-success/15",
        status === "PENDING" && "bg-warning/15 text-warning-foreground ring-1 ring-warning/20",
        status === "LOCKED" && "bg-destructive/10 text-destructive ring-1 ring-destructive/15",
        status === "DISABLED" && "bg-muted text-muted-foreground ring-1 ring-border",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {statusCopy[status]}
    </span>
  );
}

function RoleTags({ roles }: { roles: string[] }) {
  if (roles.length === 0) {
    return <span className="text-xs text-muted-foreground">Chưa gán</span>;
  }

  return (
    <div className="flex max-w-52 flex-wrap gap-1.5">
      {roles.map((role) => (
        <span
          key={role}
          className="inline-flex rounded-full bg-primary/10 px-2 py-1 text-[0.68rem] font-semibold text-primary ring-1 ring-primary/10"
        >
          {roleCopy[role] ?? role}
        </span>
      ))}
    </div>
  );
}

function LastLoginCell({ value }: { value: string }) {
  const info = getLastLoginInfo(value);

  return (
    <div
      className={joinClass(
        "inline-flex min-w-[8.75rem] items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5",
        info.tone === "recent" && "bg-primary/10 text-primary",
        info.tone === "old" && "bg-muted text-foreground",
        info.tone === "idle" && "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={joinClass(
          "size-2 rounded-full",
          info.tone === "recent" && "bg-primary",
          info.tone === "old" && "bg-muted-foreground",
          info.tone === "idle" && "bg-border",
        )}
      />
      <span className="min-w-0" title={info.detail}>
        <span className="block truncate text-xs font-semibold leading-tight">{info.label}</span>
      </span>
    </div>
  );
}

function AccountFormDialog({
  account,
  isOpen,
  isSaving,
  onClose,
  onSubmit,
}: {
  account: Account | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: AccountFormPayload) => Promise<void>;
}) {
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AccountFieldErrors>({});

  if (!isOpen) {
    return null;
  }

  const isEditing = Boolean(account);

  function validateField(form: HTMLFormElement | null, field: AccountFormField) {
    if (!form) {
      return;
    }

    const nextErrors = validateAccountForm(readAccountFormValues(form), isEditing);
    setFieldErrors((current) => ({ ...current, [field]: nextErrors[field] }));
    setFormError("");
  }

  function refreshFieldIfInvalid(form: HTMLFormElement | null, field: AccountFormField) {
    if (fieldErrors[field]) {
      validateField(form, field);
    }
  }

  function applySubmitError(message: string) {
    setFormError(message);

    if (/email/i.test(message)) {
      setFieldErrors((current) => ({ ...current, email: message }));
      return;
    }

    if (/tên đăng nhập|username/i.test(message)) {
      setFieldErrors((current) => ({ ...current, username: message }));
      return;
    }

    if (/hồ sơ nhân viên|employee/i.test(message)) {
      setFieldErrors((current) => ({ ...current, employeeId: message }));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = readAccountFormValues(event.currentTarget);
    const nextErrors = validateAccountForm(values, isEditing);

    setFormError("");
    setFieldErrors(nextErrors);

    if (hasFieldErrors(nextErrors)) {
      setFormError("Vui lòng kiểm tra lại các trường được đánh dấu.");
      return;
    }

    void (async () => {
      try {
        await onSubmit({
          username: values.username,
          email: values.email,
          employeeId: values.employeeId,
          password: values.password || undefined,
          status: account?.status ?? "ACTIVE",
          roles: values.roles,
        });
      } catch (submitError) {
        applySubmitError(
          submitError instanceof Error
            ? submitError.message
            : "Không thể lưu tài khoản. Vui lòng kiểm tra thông tin và thử lại.",
        );
      }
    })();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 px-4 py-6">
      <section className="w-full max-w-2xl overflow-hidden rounded-md border border-border bg-card shadow-[0_24px_90px_rgba(15,23,42,0.24)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold">
              {account ? "Cập nhật tài khoản" : "Thêm tài khoản"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Cập nhật thông tin truy cập cho người dùng.
            </p>
          </div>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Đóng biểu mẫu"
          >
            <X className="size-4" />
          </button>
        </div>

        <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
          {formError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">
              {formError}
            </div>
          ) : null}
          <label className="space-y-1.5" htmlFor="account-username">
            <span className="text-sm font-medium">Tên đăng nhập</span>
            <input
              id="account-username"
              name="username"
              defaultValue={account?.username}
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={fieldErrors.username ? "account-username-error" : undefined}
              onBlur={(event) => validateField(event.currentTarget.form, "username")}
              onInput={(event) => refreshFieldIfInvalid(event.currentTarget.form, "username")}
              className={joinClass(
                "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:ring-1",
                fieldErrors.username
                  ? "border-destructive focus:border-destructive focus:ring-destructive/25"
                  : "border-input focus:border-ring focus:ring-ring",
              )}
            />
            {fieldErrors.username ? (
              <span id="account-username-error" className="block text-xs font-medium text-destructive">
                {fieldErrors.username}
              </span>
            ) : null}
          </label>
          <label className="space-y-1.5" htmlFor="account-email">
            <span className="text-sm font-medium">Email</span>
            <input
              id="account-email"
              name="email"
              type="email"
              defaultValue={account?.email}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "account-email-error" : undefined}
              onBlur={(event) => validateField(event.currentTarget.form, "email")}
              onInput={(event) => refreshFieldIfInvalid(event.currentTarget.form, "email")}
              className={joinClass(
                "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:ring-1",
                fieldErrors.email
                  ? "border-destructive focus:border-destructive focus:ring-destructive/25"
                  : "border-input focus:border-ring focus:ring-ring",
              )}
            />
            {fieldErrors.email ? (
              <span id="account-email-error" className="block text-xs font-medium text-destructive">
                {fieldErrors.email}
              </span>
            ) : null}
          </label>
          <label className="space-y-1.5 sm:col-span-2" htmlFor="account-employee-id">
            <span className="text-sm font-medium">ID hồ sơ nhân viên</span>
            <input
              id="account-employee-id"
              name="employeeId"
              inputMode="numeric"
              readOnly={Boolean(account)}
              defaultValue={account?.employeeId}
              placeholder="Ví dụ: 4"
              aria-invalid={Boolean(fieldErrors.employeeId)}
              aria-describedby={
                fieldErrors.employeeId ? "account-employee-id-error" : "account-employee-id-help"
              }
              onBlur={(event) => validateField(event.currentTarget.form, "employeeId")}
              onInput={(event) => refreshFieldIfInvalid(event.currentTarget.form, "employeeId")}
              className={joinClass(
                "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:ring-1",
                fieldErrors.employeeId
                  ? "border-destructive focus:border-destructive focus:ring-destructive/25"
                  : "border-input focus:border-ring focus:ring-ring",
              )}
            />
            {fieldErrors.employeeId ? (
              <span id="account-employee-id-error" className="block text-xs font-medium text-destructive">
                {fieldErrors.employeeId}
              </span>
            ) : (
              <span id="account-employee-id-help" className="block text-xs text-muted-foreground">
                Tạo tài khoản cần dùng ID hồ sơ nhân viên đã tồn tại trong hệ thống.
              </span>
            )}
          </label>
          <label className="space-y-1.5" htmlFor="account-roles">
            <span className="text-sm font-medium">Vai trò</span>
            <select
              id="account-roles"
              name="roles"
              multiple
              size={4}
              defaultValue={account?.roles.length ? account.roles : ["EMPLOYEE"]}
              aria-invalid={Boolean(fieldErrors.roles)}
              aria-describedby={fieldErrors.roles ? "account-roles-error" : "account-roles-help"}
              onBlur={(event) => validateField(event.currentTarget.form, "roles")}
              onChange={(event) => validateField(event.currentTarget.form, "roles")}
              className={joinClass(
                "min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:ring-1",
                fieldErrors.roles
                  ? "border-destructive focus:border-destructive focus:ring-destructive/25"
                  : "border-input focus:border-ring focus:ring-ring",
              )}
            >
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
            {fieldErrors.roles ? (
              <span id="account-roles-error" className="block text-xs font-medium text-destructive">
                {fieldErrors.roles}
              </span>
            ) : (
              <span id="account-roles-help" className="block text-xs text-muted-foreground">
                Giữ Ctrl để chọn nhiều vai trò nếu cần.
              </span>
            )}
          </label>
          {!account ? (
            <label className="space-y-1.5 sm:col-span-2" htmlFor="account-password">
              <span className="text-sm font-medium">Mật khẩu</span>
              <input
                id="account-password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="Ví dụ: Password@123"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "account-password-error" : "account-password-help"}
                onBlur={(event) => validateField(event.currentTarget.form, "password")}
                onInput={(event) => refreshFieldIfInvalid(event.currentTarget.form, "password")}
                className={joinClass(
                  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:ring-1",
                  fieldErrors.password
                    ? "border-destructive focus:border-destructive focus:ring-destructive/25"
                    : "border-input focus:border-ring focus:ring-ring",
                )}
              />
              {fieldErrors.password ? (
                <span id="account-password-error" className="block text-xs font-medium text-destructive">
                  {fieldErrors.password}
                </span>
              ) : (
                <span id="account-password-help" className="block text-xs text-muted-foreground">
                  {passwordRules.join(" • ")}
                </span>
              )}
            </label>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2">
            <button
              type="button"
              className="h-10 rounded-md border border-border px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={onClose}
              disabled={isSaving}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
            >
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {account ? "Lưu thay đổi" : "Tạo tài khoản"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
