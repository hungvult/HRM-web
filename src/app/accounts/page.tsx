"use client";

import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardCheck,
  Clock3,
  FileChartColumn,
  GraduationCap,
  HandCoins,
  IdCard,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  UserRoundCog,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getApiBaseUrl } from "@/lib/api";
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
import { logoutClientSide } from "@/lib/auth";

const pageSize = 8;

const navGroups = [
  {
    label: "Vận hành",
    items: [
      { label: "Tổng quan", icon: LayoutDashboard },
      { label: "Quản lý tài khoản", icon: UserRoundCog, active: true },
      { label: "Hồ sơ nhân viên", icon: IdCard },
      { label: "Phòng ban", icon: Building2 },
      { label: "Chức vụ", icon: BriefcaseBusiness },
      { label: "Phân công nhân viên", icon: Users },
    ],
  },
  {
    label: "Chấm công & lương",
    items: [
      { label: "Bảng công", icon: Clock3 },
      { label: "Nghỉ phép", icon: CalendarCheck },
      { label: "Bảng lương", icon: WalletCards },
      { label: "Phúc lợi", icon: HandCoins },
    ],
  },
  {
    label: "Phát triển",
    items: [
      { label: "Tuyển dụng", icon: UserRound },
      { label: "Đào tạo", icon: GraduationCap },
      { label: "Đánh giá", icon: ClipboardCheck },
      { label: "Báo cáo", icon: FileChartColumn },
    ],
  },
];

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

function formatRoles(roles: string[]) {
  if (roles.length === 0) {
    return "Chưa gán";
  }

  return roles.map((role) => roleCopy[role] ?? role).join(", ");
}

function splitRoles(value: string) {
  return value
    .split(",")
    .map((role) => role.trim().toUpperCase())
    .filter(Boolean);
}

export default function AccountManagementPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const allVisibleSelected =
    accounts.length > 0 && accounts.every((account) => selectedIds.includes(account.id));

  const stats = useMemo(() => {
    const active = accounts.filter((account) => account.status === "ACTIVE").length;
    const locked = accounts.filter((account) => account.status === "LOCKED").length;
    const disabled = accounts.filter((account) => account.status === "DISABLED").length;

    return [
      { label: "Tổng tài khoản", value: String(total), detail: "Theo dữ liệu API", icon: Users },
      { label: "Đang hoạt động", value: String(active), detail: "Trong trang hiện tại", icon: ShieldCheck },
      { label: "Vô hiệu hóa", value: String(disabled), detail: "Không còn sử dụng", icon: Clock3 },
      { label: "Đã khóa", value: String(locked), detail: "Không thể đăng nhập", icon: BarChart3 },
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
        setError(
          apiError instanceof Error
            ? apiError.message
            : "Không thể tải danh sách tài khoản từ môi trường test.",
        );
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
        reloadAccounts("Đã cập nhật tài khoản trên môi trường test.");
      } else {
        await createUserAccount(payload);
        setPage(1);
        reloadAccounts("Đã tạo tài khoản mới trên môi trường test.");
      }

      setFormOpen(false);
      setEditingAccount(null);
    } catch (apiError) {
      setNotice(apiError instanceof Error ? apiError.message : "Không thể lưu tài khoản.");
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
      setNotice(apiError instanceof Error ? apiError.message : "Không thể cập nhật trạng thái.");
    }
  }

  function handleLogout() {
    logoutClientSide();
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Đóng menu"
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={joinClass(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-20 shrink-0 items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-primary font-display text-base font-bold text-primary-foreground shadow-sm">
              HR
            </span>
            <div>
              <p className="font-display text-base font-semibold">HRM</p>
              <p className="text-[0.68rem] text-muted-foreground">Quản trị nhân sự</p>
            </div>
          </div>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Đóng menu"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mx-4 mb-5 flex items-center gap-3 rounded-md border border-border bg-muted/50 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-primary">
            QT
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Quản trị hệ thống</p>
            <p className="text-[0.68rem] text-muted-foreground">Admin</p>
          </div>
          <button
            type="button"
            aria-label="Thông báo"
            title="Thông báo"
            className="relative grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Bell className="size-4" />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Điều hướng chính">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1.5 px-3 text-[0.65rem] font-semibold uppercase text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setSidebarOpen(false);
                      if (!item.active) {
                        setNotice(`${item.label} sẽ được kết nối ở module tiếp theo.`);
                      }
                    }}
                    className={joinClass(
                      "flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-[0.82rem] font-medium transition-colors",
                      item.active
                        ? "bg-accent text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border p-3">
          <button
            type="button"
            className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings2 className="size-4" />
            Cài đặt hệ thống
          </button>
          <button
            type="button"
            className="mt-0.5 flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
          >
            <LogOut className="size-4" />
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-sm sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Mở menu"
            >
              <Menu className="size-4" />
            </button>
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-semibold sm:text-2xl">
                Quản lý tài khoản
              </p>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Kiểm soát quyền truy cập, trạng thái và vai trò người dùng
              </p>
            </div>
          </div>
          <button
            type="button"
            className="flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            onClick={openCreateForm}
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Thêm tài khoản</span>
          </button>
        </header>

        <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-7">
          <section className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-card sm:grid-cols-4" aria-label="Thống kê tài khoản">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className={joinClass(
                  "flex items-start gap-3 px-4 py-4 sm:px-5",
                  index % 2 !== 0 && "border-l border-border",
                  index > 1 && "border-t border-border sm:border-t-0",
                  index > 0 && "sm:border-l sm:border-border",
                )}
              >
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-accent text-primary">
                  <stat.icon className="size-4" />
                </span>
                <div>
                  <p className="text-[0.7rem] text-muted-foreground">{stat.label}</p>
                  <p className="font-display text-xl font-semibold">{stat.value}</p>
                  <p className="hidden text-[0.68rem] text-muted-foreground sm:block">
                    {stat.detail}
                  </p>
                </div>
              </div>
            ))}
          </section>

          <section aria-labelledby="account-table-title" className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 id="account-table-title" className="font-display text-lg font-semibold">
                  Danh sách tài khoản
                </h1>
                <p className="text-xs text-muted-foreground">
                  API test: <span className="font-medium text-foreground">{getApiBaseUrl()}</span>
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative block sm:w-72">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <span className="sr-only">Tìm kiếm tài khoản</span>
                  <input
                    value={query}
                    onChange={(event) => {
                      prepareFetch();
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Tên, email hoặc mã nhân viên"
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </label>
                <label className="relative">
                  <span className="sr-only">Lọc trạng thái</span>
                  <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <select
                    value={status}
                    onChange={(event) => {
                      prepareFetch();
                      setStatus(event.target.value as "ALL" | AccountStatus);
                      setPage(1);
                    }}
                    className="h-10 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-9 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring sm:w-44"
                  >
                    <option value="ALL">Mọi trạng thái</option>
                    <option value="ACTIVE">Đang hoạt động</option>
                    <option value="LOCKED">Đã khóa</option>
                    <option value="DISABLED">Vô hiệu hóa</option>
                  </select>
                  <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </label>
                <button
                  type="button"
                  className="flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  onClick={() => reloadAccounts("Đã tải lại danh sách tài khoản.")}
                >
                  <RefreshCcw className="size-4" />
                  Tải lại
                </button>
              </div>
            </div>

            {selectedIds.length > 0 ? (
              <div className="flex items-center justify-between border-b border-border bg-accent/60 px-4 py-2 text-xs">
                <span className="font-medium text-primary">Đã chọn {selectedIds.length} tài khoản</span>
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
              <table className="w-full min-w-[980px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/45 text-[0.68rem] uppercase text-muted-foreground">
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={togglePageSelection}
                        aria-label="Chọn tất cả tài khoản trên trang"
                        className="size-4 rounded border-input accent-primary"
                      />
                    </th>
                    <th className="px-3 py-3 font-semibold">Nhân viên</th>
                    <th className="px-3 py-3 font-semibold">Tài khoản</th>
                    <th className="px-3 py-3 font-semibold">Vai trò</th>
                    <th className="px-3 py-3 font-semibold">Phòng ban</th>
                    <th className="px-3 py-3 font-semibold">Trạng thái</th>
                    <th className="px-3 py-3 font-semibold">Đăng nhập gần nhất</th>
                    <th className="w-40 px-3 py-3 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center text-sm text-muted-foreground">
                        <LoaderCircle className="mx-auto mb-3 size-7 animate-spin" />
                        Đang tải dữ liệu từ API test...
                      </td>
                    </tr>
                  ) : null}

                  {!isLoading && accounts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center">
                        <Search className="mx-auto mb-3 size-7 text-muted-foreground" />
                        <p className="font-semibold">Không tìm thấy tài khoản</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Thử từ khóa, trạng thái khác hoặc kiểm tra API test.
                        </p>
                      </td>
                    </tr>
                  ) : null}

                  {!isLoading
                    ? accounts.map((account) => (
                        <tr key={account.id} className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/35">
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
                              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-primary">
                                {account.initials}
                              </span>
                              <div>
                                <p className="text-sm font-semibold">{account.fullName}</p>
                                <p className="text-xs text-muted-foreground">{account.employeeCode}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <p className="text-sm font-medium">{account.username || "Chưa cập nhật"}</p>
                            <p className="text-xs text-muted-foreground">{account.email}</p>
                          </td>
                          <td className="px-3 py-3 text-sm">{formatRoles(account.roles)}</td>
                          <td className="px-3 py-3 text-sm text-muted-foreground">
                            <p>{account.department}</p>
                            {account.position ? (
                              <p className="text-[0.68rem]">{account.position}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            <StatusBadge status={account.status} />
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {formatLastLogin(account.lastLoginAt)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                aria-label={`Sửa ${account.fullName}`}
                                title="Sửa tài khoản"
                                onClick={() => openEditForm(account)}
                              >
                                <Pencil className="size-4" />
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                onClick={() => void handleToggleStatus(account)}
                              >
                                {account.status === "ACTIVE" ? "Khóa" : "Mở khóa"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Hiển thị {accounts.length === 0 ? 0 : (page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, total)} trong {total} tài khoản
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={page === 1}
                  onClick={() => {
                    prepareFetch();
                    setPage((current) => Math.max(1, current - 1));
                  }}
                  aria-label="Trang trước"
                >
                  <ChevronLeft className="size-4" />
                </button>
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                  <button
                    key={number}
                    type="button"
                    className={joinClass(
                      "grid size-8 place-items-center rounded-md text-sm font-semibold transition",
                      number === page
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    onClick={() => {
                      prepareFetch();
                      setPage(number);
                    }}
                    aria-label={`Trang ${number}`}
                  >
                    {number}
                  </button>
                ))}
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={page >= pageCount}
                  onClick={() => {
                    prepareFetch();
                    setPage((current) => Math.min(pageCount, current + 1));
                  }}
                  aria-label="Trang sau"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </section>

          <p role="status" aria-live="polite" className="min-h-5 text-center text-xs text-muted-foreground">
            {notice}
          </p>
        </div>
      </main>

      <AccountFormDialog
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
    </div>
  );
}

function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span
      className={joinClass(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[0.68rem] font-semibold",
        status === "ACTIVE" && "bg-success/12 text-success",
        status === "PENDING" && "bg-warning/15 text-warning-foreground",
        status === "LOCKED" && "bg-destructive/10 text-destructive",
        status === "DISABLED" && "bg-muted text-muted-foreground",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {statusCopy[status]}
    </span>
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
  if (!isOpen) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "").trim();

    void onSubmit({
      username: String(formData.get("username") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      employeeId: String(formData.get("employeeId") ?? "").trim(),
      password: password || undefined,
      status: account?.status ?? "ACTIVE",
      roles: splitRoles(String(formData.get("roles") ?? "")),
    });
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
              Dữ liệu sẽ được ghi trực tiếp qua API môi trường test.
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

        <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={handleSubmit}>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Tên đăng nhập</span>
            <input
              name="username"
              required
              defaultValue={account?.username}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Email</span>
            <input
              name="email"
              type="email"
              required
              defaultValue={account?.email}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">ID hồ sơ nhân viên</span>
            <input
              name="employeeId"
              required={!account}
              readOnly={Boolean(account)}
              defaultValue={account?.employeeId}
              placeholder="Ví dụ: 4"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <span className="block text-xs text-muted-foreground">
              Tạo tài khoản cần dùng ID hồ sơ nhân viên đã tồn tại trong hệ thống.
            </span>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Vai trò</span>
            <input
              name="roles"
              required
              defaultValue={account?.roles.join(", ") || "EMPLOYEE"}
              placeholder="ADMIN, HR, MANAGER, EMPLOYEE"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </label>
          {!account ? (
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Mật khẩu</span>
              <input
                name="password"
                type="password"
                required
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
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
