"use client";

import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Power,
  RefreshCcw,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";

export const inputClass =
  "h-10 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition focus:border-ring focus:ring-1 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground";
export const tableClass =
  "w-full min-w-[960px] border-collapse text-left text-sm [&_th]:px-4 [&_th]:py-3 [&_th]:font-semibold [&_td]:px-4 [&_td]:py-3 [&_tbody_tr]:border-b [&_tbody_tr]:border-border/70 [&_tbody_tr:last-child]:border-0 [&_tbody_tr:hover]:bg-primary/5";

export function StatisticSummary({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    detail: string;
    icon: LucideIcon;
  }>;
}) {
  return (
    <section
      aria-label="Thống kê"
      className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-white shadow-sm sm:grid-cols-4"
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          className={[
            "flex min-w-0 items-start gap-3 px-4 py-4 sm:px-5",
            index % 2 ? "border-l border-border" : "",
            index > 1 ? "border-t border-border sm:border-t-0" : "",
            index > 0 ? "sm:border-l sm:border-border" : "",
          ].join(" ")}
        >
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <item.icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.7rem] text-muted-foreground">{item.label}</p>
            <p className="font-display text-xl font-semibold">{item.value}</p>
            <p className="hidden text-[0.68rem] text-muted-foreground sm:block">
              {item.detail}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}

export function ListCard({
  title,
  titleId,
  description,
  actions,
  children,
  footer,
}: {
  title: string;
  titleId?: string;
  description: string;
  actions: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 xl:max-w-56 xl:shrink-0">
          <h2 id={titleId} className="font-display text-lg font-semibold">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
          {actions}
        </div>
      </div>
      {children}
      {footer && (
        <div className="border-t border-border px-4 py-3">{footer}</div>
      )}
    </section>
  );
}

export function FilterBar({
  query,
  onQuery,
  filters,
  onReload,
  placeholder,
}: {
  query: string;
  onQuery: (value: string) => void;
  filters: Array<{
    label: string;
    value: string;
    options: Array<string | { value: string; label: string }>;
    onChange: (value: string) => void;
  }>;
  onReload: () => void;
  placeholder: string;
}) {
  return (
    <>
      <label className="relative min-w-0 basis-full sm:basis-auto sm:w-56">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <span className="sr-only">{placeholder}</span>
        <input
          className={inputClass + " pl-9"}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={placeholder}
        />
      </label>
      {filters.map((filter) => (
        <label
          key={filter.label}
          className="min-w-0 basis-[140px] flex-1 sm:w-40 sm:basis-auto sm:flex-none"
        >
          <span className="sr-only">{filter.label}</span>
          <select
            aria-label={filter.label}
            className={inputClass}
            value={filter.value}
            onChange={(event) => filter.onChange(event.target.value)}
          >
            <option value="">{filter.label}</option>
            {filter.options.map((option) => (
              <option
                key={typeof option === "string" ? option : option.value}
                value={typeof option === "string" ? option : option.value}
              >
                {typeof option === "string" ? option : option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button
        type="button"
        aria-label="Tải lại"
        title="Tải lại"
        onClick={onReload}
        className="grid size-10 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"
      >
        <RefreshCcw className="size-4" />
      </button>
    </>
  );
}

export function TableFooter({
  total,
  page,
  pageSize = 8,
  onPage,
}: {
  total: number;
  page: number;
  pageSize?: number;
  onPage: (page: number) => void;
}) {
  const count = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, count);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>
        Hiển thị {total ? (current - 1) * pageSize + 1 : 0}-
        {Math.min(current * pageSize, total)} / {total}
      </span>
      <nav aria-label="Phân trang" className="flex items-center gap-1">
        <button
          aria-label="Trang trước"
          title="Trang trước"
          type="button"
          disabled={current === 1}
          onClick={() => onPage(current - 1)}
          className="grid size-8 place-items-center rounded-md border border-border disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        {Array.from({ length: count }, (_, i) => i + 1)
          .filter((n) => n === 1 || n === count || Math.abs(n - current) < 2)
          .map((n) => (
            <button
              type="button"
              key={n}
              aria-label={"Trang " + n}
              aria-current={n === current ? "page" : undefined}
              onClick={() => onPage(n)}
              className={
                "grid size-8 place-items-center rounded-md border border-border font-medium " +
                (n === current
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted")
              }
            >
              {n}
            </button>
          ))}
        <button
          aria-label="Trang sau"
          title="Trang sau"
          type="button"
          disabled={current === count}
          onClick={() => onPage(current + 1)}
          className="grid size-8 place-items-center rounded-md border border-border disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </nav>
    </div>
  );
}

export function RowActions({
  name,
  onView,
  onEdit,
  onStatus,
  statusLabel,
  onDelete,
}: {
  name: string;
  onView?: () => void;
  onEdit?: () => void;
  onStatus?: () => void;
  statusLabel?: string;
  onDelete?: () => void;
}) {
  const actions = [
    ...(onView ? [{ label: "Xem chi tiết", icon: Eye, run: onView }] : []),
    ...(onEdit ? [{ label: "Chỉnh sửa", icon: Pencil, run: onEdit }] : []),
    ...(onStatus
      ? [{ label: statusLabel || "Đổi trạng thái", icon: Power, run: onStatus }]
      : []),
    ...(onDelete ? [{ label: "Xóa", icon: Trash2, run: onDelete }] : []),
  ];
  return (
    <div className="flex justify-end gap-1">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          title={action.label}
          aria-label={action.label + " " + name}
          onClick={action.run}
          className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <action.icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({ label }: { label: string }) {
  const tone = ["Đang làm", "Đang hoạt động", "Hiện tại"].includes(label)
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : label === "Nghỉ việc" || label === "Đã kết thúc"
      ? "border-border bg-muted text-muted-foreground"
      : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold " +
        tone
      }
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function EmptyRow({ columns }: { columns: number }) {
  return (
    <tr>
      <td colSpan={columns} className="h-32 text-center text-muted-foreground">
        Không tìm thấy kết quả.
      </td>
    </tr>
  );
}

export function Drawer({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-xl border-l border-border bg-white p-0 text-foreground shadow-xl backdrop:bg-black/30"
    >
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-white p-5">
          <h2 id={id} className="font-display text-xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Đóng"
            aria-label="Đóng"
            disabled={busy}
            className="grid size-9 shrink-0 place-items-center rounded-md border border-border hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 p-5">{children}</div>
      </div>
    </dialog>
  );
}

export function FormField({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id?: string;
              className?: string;
              "aria-invalid"?: boolean;
              "aria-describedby"?: string;
            }>,
            {
              id,
              ...(error
                ? {
                    "aria-invalid": true,
                    "aria-describedby": id + "-error",
                    className:
                        ((children.props as { className?: string }).className ?? "") +
                      " aria-invalid:border-destructive aria-invalid:focus:ring-destructive/25",
                  }
                : {}),
            },
          )
        : children}
      {error && (
        <p
          id={id + "-error"}
          role="alert"
          className="text-xs font-medium text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function FormActions({
  onClose,
  readOnly = false,
  primaryLabel = "Lưu",
  busy = false,
}: {
  onClose: () => void;
  readOnly?: boolean;
  primaryLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="h-10 rounded-md border border-border px-4 text-sm hover:bg-muted"
      >
        {readOnly ? "Đóng" : "Hủy"}
      </button>
      {!readOnly && (
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          {busy ? "Đang lưu..." : primaryLabel}
        </button>
      )}
    </div>
  );
}
