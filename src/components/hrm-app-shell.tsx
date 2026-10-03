"use client";

import Link from "next/link";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  Clock3,
  Download,
  IdCard,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Save,
  UserRound,
  UserRoundCog,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { logoutClientSide } from "@/lib/auth";
import { canManageHrm, roleLabels, type CurrentUser } from "@/lib/hrm-api";

type HrmAppShellProps = {
  activeLabel: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionIcon?: "plus" | "save";
  secondaryActionLabel?: string;
  onAction?: () => void;
  onSecondaryAction?: () => void;
  actionDisabled?: boolean;
  actionForm?: string;
  children: ReactNode;
  user?: CurrentUser | null;
  secondaryActionDisabled?: boolean;
};

const navGroups = [
  {
    label: "Quản trị",
    items: [
      { label: "Quản lý tài khoản", href: "/accounts", icon: UserRoundCog },
    ],
  },
  {
    label: "Nhân sự",
    items: [
      { label: "Hồ sơ nhân viên", href: "/employees", icon: IdCard },
      { label: "Phòng ban", href: "/organization", icon: Building2 },
      { label: "Chức vụ", href: "/positions", icon: BriefcaseBusiness },
      { label: "Phân công nhân viên", href: "/assignments", icon: Users },
    ],
  },
  {
    label: "Chấm công & lương",
    items: [
      { label: "Bảng công", href: "#", icon: Clock3 },
      { label: "Nghỉ phép", href: "#", icon: CalendarCheck },
      { label: "Bảng lương", href: "#", icon: WalletCards },
      { label: "Địa điểm làm việc", href: "#", icon: MapPin },
    ],
  },
  {
    label: "Cá nhân",
    items: [{ label: "Thông tin cá nhân", href: "/profile", icon: UserRound }],
  },
];

function joinClass(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function HrmAppShell({
  activeLabel,
  title,
  description,
  actionLabel,
  actionIcon = "plus",
  secondaryActionLabel,
  onAction,
  onSecondaryAction,
  actionDisabled,
  actionForm,
  children,
  user,
  secondaryActionDisabled,
}: HrmAppShellProps) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const ActionIcon = actionIcon === "save" ? Save : Plus;

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
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-20 shrink-0 items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-primary font-display text-base font-bold text-primary-foreground shadow-sm shadow-primary/20">
              HR
            </span>
            <div>
              <p className="font-display text-base font-semibold">HRM</p>
              <p className="text-[0.68rem] text-muted-foreground">
                Quản trị nhân sự
              </p>
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

        <div className="mx-4 mb-5 flex items-center gap-3 rounded-md border border-border bg-accent/35 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-primary ring-1 ring-border">
            {user?.employee?.fullName
              ?.split(/\s+/)
              .slice(-2)
              .map((part) => part[0])
              .join("") ||
              user?.username?.slice(0, 2).toUpperCase() ||
              "HR"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold">
              {user?.employee?.fullName || user?.username || "Người dùng"}
            </p>
            <p className="text-[0.68rem] text-muted-foreground">
              {user?.roles.map((role) => roleLabels[role] || role).join(", ") ||
                "-"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Thông báo"
            title="Thông báo chưa khả dụng"
            disabled
            className="relative grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Bell className="size-4" />
          </button>
        </div>

        <nav
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
          aria-label="Điều hướng chính"
        >
          {navGroups
            .map((group) => ({
              ...group,
              items: group.items.filter(
                (item) =>
                  item.href === "/profile" ||
                  (item.href === "/accounts"
                    ? user?.roles.includes("ADMIN")
                    : canManageHrm(user ?? null)),
              ),
            }))
            .filter((group) => group.items.length)
            .map((group) => (
              <div key={group.label} className="mb-5">
                <p className="mb-1.5 px-3 text-[0.65rem] font-semibold uppercase text-muted-foreground">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = item.label === activeLabel;
                    const content = (
                      <>
                        <item.icon
                          className="size-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.label}</span>
                      </>
                    );

                    if (item.href === "#") {
                      return (
                        <button
                          key={item.label}
                          type="button"
                          disabled
                          className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-[0.82rem] font-medium text-muted-foreground disabled:opacity-50"
                        >
                          {content}
                        </button>
                      );
                    }

                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={joinClass(
                          "flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-[0.82rem] font-medium transition-colors",
                          active
                            ? "bg-primary/12 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {content}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
        </nav>

        <div className="shrink-0 border-t border-border p-3">
          <button
            type="button"
            onClick={() => {
              logoutClientSide();
              router.push("/login");
            }}
            className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="size-4" />
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-border bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-7">
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
              <h1 className="break-words font-display text-xl font-semibold sm:text-2xl">
                {title}
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {description}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {secondaryActionLabel ? (
              <button
                type="button"
                onClick={onSecondaryAction}
                disabled={secondaryActionDisabled}
                title={secondaryActionLabel}
                aria-label={secondaryActionLabel}
                className="flex h-10 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-card-foreground transition hover:bg-muted"
              >
                <Download className="size-4" />
                <span className="hidden sm:inline">{secondaryActionLabel}</span>
              </button>
            ) : null}
            {actionLabel ? (
              <button
                type={actionForm ? "submit" : "button"}
                form={actionForm}
                onClick={onAction}
                disabled={actionDisabled}
                title={actionLabel}
                aria-label={actionLabel}
                className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ActionIcon className="size-4" />
                <span className="hidden sm:inline">{actionLabel}</span>
              </button>
            ) : null}
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-7">
          {children}
        </div>
      </main>
    </div>
  );
}
