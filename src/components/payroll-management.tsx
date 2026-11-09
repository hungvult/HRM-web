"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ArrowLeft, Eye, RefreshCcw } from "lucide-react";
import HrmAppShell from "@/components/hrm-app-shell";
import { ApiFeedback, LoadingRow } from "@/components/api-feedback";
import {
  Drawer,
  EmptyRow,
  FilterBar,
  FormField,
  ListCard,
  TableFooter,
  inputClass,
  tableClass,
} from "@/components/hrm-ui";
import { fetchAll, fetchMyProfile, type CatalogRecord } from "@/lib/hrm-api";
import { canManageSalary, formatVnd } from "@/lib/salary-profiles";
import { useApiResource } from "@/lib/use-api-resource";
import {
  canConfirmPayroll,
  confirmPayroll,
  fetchPayrollItems,
  fetchPayrollRun,
  fetchPayrollRuns,
  lastClosedMonth,
  payrollErrorMessage,
  payrollStatusLabels,
  periodLabel,
  previewPayroll,
  publishPayroll,
  type PayrollAccount,
  type PayrollFilters,
  type PayrollItem,
  type PayrollItemFilters,
  type PayrollPreview,
  type PayrollStatus,
  type PayrollSummary,
} from "@/lib/payroll-runs";

const button =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const primary =
  button +
  " border-primary bg-primary text-primary-foreground hover:bg-primary/90";
const initialFilters: PayrollFilters = {
  period: "",
  status: "",
  page: 0,
  size: 10,
};
const initialItemFilters: PayrollItemFilters = {
  q: "",
  departmentId: "",
  page: 0,
  size: 10,
};

async function readable<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    throw new Error(payrollErrorMessage(error));
  }
}
function dateTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}
const accountName = (account: PayrollAccount | null) =>
  account?.displayName || account?.username || "—";
const workNumber = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 6 }).format(
        value,
      );
function Status({ value }: { value: PayrollStatus }) {
  return (
    <span
      className={
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium " +
        (value === "PUBLISHED"
          ? "bg-emerald-50 text-emerald-800"
          : "bg-amber-50 text-amber-800")
      }
    >
      {payrollStatusLabels[value] || value}
    </span>
  );
}
function Summary({ value, label }: { value: PayrollSummary; label: string }) {
  return (
    <section
      aria-label={label}
      className="rounded-md border border-border bg-white p-4"
    >
      <h3 className="mb-3 text-sm font-semibold">{label}</h3>
      <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Nhân viên", String(value.employeeCount)],
          ["Lương theo công", formatVnd(value.totalEarnedBaseSalary)],
          ["Phụ cấp theo công", formatVnd(value.totalEarnedAllowance)],
          ["Khấu trừ theo công", formatVnd(value.totalEarnedDeduction)],
          ["Thực nhận", formatVnd(value.totalNetSalary)],
        ].map(([key, text]) => (
          <div key={key} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{key}</dt>
            <dd className="mt-1 break-words font-semibold tabular-nums">
              {text}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
    >
      {children}
    </p>
  );
}

export default function PayrollManagement() {
  const session = useApiResource(fetchMyProfile);
  const allowed = canManageSalary(session.data);
  const [view, setView] = useState<"list" | "preview" | number>("list");
  const [filters, setFilters] = useState<PayrollFilters>(initialFilters);
  const [notice, setNotice] = useState("");
  const [locked, setLocked] = useState(false);
  const back = () => {
    if (!locked) setView("list");
  };
  return (
    <HrmAppShell
      activeLabel="Bảng lương"
      title="Bảng lương tháng"
      description="Tạo, kiểm tra và công bố bảng lương theo từng kỳ"
      user={session.data}
      actionLabel={allowed && view === "list" ? "Tạo bảng lương" : undefined}
      onAction={() => {
        setNotice("");
        setView("preview");
      }}
    >
      {session.loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Đang kiểm tra quyền truy cập...
        </p>
      ) : session.error ? (
        <ApiFeedback
          error="Không thể xác minh phiên đăng nhập. Vui lòng thử lại hoặc đăng nhập lại."
          onRetry={session.reload}
        />
      ) : !allowed ? (
        <ApiFeedback error="Chỉ nhân sự (HR) được quản lý bảng lương." />
      ) : (
        <>
          {view !== "list" && (
            <button
              type="button"
              className={button}
              disabled={locked}
              onClick={back}
            >
              <ArrowLeft className="size-4" />
              Danh sách bảng lương
            </button>
          )}
          {notice && <Notice>{notice}</Notice>}
          {view === "list" ? (
            <RunList
              filters={filters}
              onFilters={setFilters}
              onSelect={(id) => {
                setNotice("");
                setView(id);
              }}
            />
          ) : view === "preview" ? (
            <PreviewPanel
              onBusy={setLocked}
              onCreated={(id) => {
                setNotice(
                  "Đã tạo bảng lương. Kiểm tra chi tiết trước khi công bố.",
                );
                setView(id);
              }}
            />
          ) : (
            <RunDetail
              key={view}
              id={view}
              onBusy={setLocked}
              onPublished={() => setNotice("")}
            />
          )}
        </>
      )}
    </HrmAppShell>
  );
}

function RunList({
  filters,
  onFilters,
  onSelect,
}: {
  filters: PayrollFilters;
  onFilters: (filters: PayrollFilters) => void;
  onSelect: (id: number) => void;
}) {
  const load = useCallback(
    async (signal: AbortSignal) => readable(fetchPayrollRuns(filters, signal)),
    [filters],
  );
  const list = useApiResource(load);
  const update = (next: Partial<PayrollFilters>) =>
    onFilters({ ...filters, ...next, page: 0 });
  return (
    <ListCard
      title="Các kỳ lương"
      description="Dữ liệu đã lưu của từng kỳ lương"
      actions={
        <>
          <label className="w-56 max-w-full shrink-0">
            <span className="sr-only">Kỳ lương</span>
            <input
              aria-label="Kỳ lương"
              type="month"
              className={inputClass}
              value={filters.period}
              onChange={(e) => update({ period: e.target.value })}
            />
          </label>
          <select
            aria-label="Trạng thái bảng lương"
            className={inputClass + " sm:w-44"}
            value={filters.status}
            onChange={(e) => update({ status: e.target.value })}
          >
            <option value="">Mọi trạng thái</option>
            {Object.entries(payrollStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={button}
            onClick={() => onFilters(initialFilters)}
          >
            Xóa bộ lọc
          </button>
          <button
            type="button"
            aria-label="Tải lại bảng lương"
            className={button}
            onClick={list.reload}
          >
            <RefreshCcw className="size-4" />
          </button>
        </>
      }
      footer={
        <TableFooter
          total={list.data?.totalElements ?? 0}
          page={filters.page + 1}
          pageSize={filters.size}
          onPage={(page) => onFilters({ ...filters, page: page - 1 })}
        />
      }
    >
      {list.error && (
        <div className="p-4">
          <ApiFeedback error={list.error} onRetry={list.reload} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className={tableClass} aria-label="Danh sách bảng lương">
          <thead className="bg-muted/40">
            <tr>
              <th>Kỳ lương</th>
              <th>Trạng thái</th>
              <th className="text-right">Nhân viên</th>
              <th className="text-right">Tổng thực nhận</th>
              <th>Người tạo / Thời điểm</th>
              <th>Công bố</th>
              <th className="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {list.loading ? (
              <LoadingRow columns={7} />
            ) : !list.error && !list.data?.content.length ? (
              <EmptyRow columns={7} />
            ) : (
              list.data?.content.map((run) => (
                <tr key={run.id}>
                  <td className="font-semibold">{periodLabel(run.period)}</td>
                  <td>
                    <Status value={run.status} />
                  </td>
                  <td className="text-right tabular-nums">
                    {run.employeeCount}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatVnd(run.totalNetSalary)}
                  </td>
                  <td>
                    {accountName(run.generatedBy)}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dateTime(run.generatedAt)}
                    </p>
                  </td>
                  <td>
                    {run.publishedAt ? (
                      <>
                        {accountName(run.publishedBy)}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {dateTime(run.publishedAt)}
                        </p>
                      </>
                    ) : (
                      "Chưa công bố"
                    )}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className={button}
                      aria-label={`Xem bảng lương ${periodLabel(run.period)}`}
                      onClick={() => onSelect(run.id)}
                    >
                      <Eye className="size-4" />
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ListCard>
  );
}

function RunDetail({
  id,
  onBusy,
  onPublished,
}: {
  id: number;
  onBusy: (value: boolean) => void;
  onPublished: () => void;
}) {
  const load = useCallback(
    async (signal: AbortSignal) => readable(fetchPayrollRun(id, signal)),
    [id],
  );
  const detail = useApiResource(load);
  const [filters, setFilters] =
    useState<PayrollItemFilters>(initialItemFilters);
  const loadItems = useCallback(
    async (signal: AbortSignal) => readable(fetchPayrollItems(id, filters, signal)),
    [id, filters],
  );
  const items = useApiResource(loadItems, Boolean(detail.data));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const writing = useRef(false);
  const reload = () => {
    setUncertain(false);
    setError("");
    detail.reload();
    items.reload();
  };
  async function publish() {
    if (writing.current || uncertain || detail.data?.status !== "GENERATED")
      return;
    writing.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await publishPayroll(id);
      onPublished();
      setNotice(
        "Đã công bố bảng lương. Nhân viên có thể xem phiếu lương của mình.",
      );
      setConfirm(false);
      detail.reload();
      items.reload();
    } catch (err) {
      setError(payrollErrorMessage(err, true));
      setUncertain(true);
      setConfirm(false);
    } finally {
      writing.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  if (detail.loading)
    return <p role="status">Đang tải chi tiết bảng lương...</p>;
  if (detail.error)
    return <ApiFeedback error={detail.error} onRetry={detail.reload} />;
  const run = detail.data;
  if (!run) return null;
  return (
    <>
      {notice && <Notice>{notice}</Notice>}
      <ListCard
        title={`Bảng lương ${periodLabel(run.period)}`}
        description="Thông tin được lưu tại thời điểm tạo bảng lương"
        actions={
          <>
            <Status value={run.status} />
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={reload}
            >
              Tải lại
            </button>
            {run.status === "GENERATED" && (
              <button
                type="button"
                className={primary}
                disabled={busy || uncertain}
                onClick={() => setConfirm(true)}
              >
                Công bố bảng lương
              </button>
            )}
          </>
        }
      >
        <dl className="grid gap-4 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Công chuẩn</dt>
            <dd className="mt-1 font-medium">
              {run.workStandard.standardWorkingDays ?? "—"} ngày ·{" "}
              {run.workStandard.standardMinutesPerDay ?? "—"} phút/ngày
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Người tạo</dt>
            <dd className="mt-1">
              {accountName(run.generatedBy)}
              <p className="text-xs text-muted-foreground">
                {dateTime(run.generatedAt)}
              </p>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Người công bố</dt>
            <dd className="mt-1">
              {accountName(run.publishedBy)}
              <p className="text-xs text-muted-foreground">
                {dateTime(run.publishedAt)}
              </p>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Đơn vị</dt>
            <dd className="mt-1">VND · Số liệu theo công hưởng lương</dd>
          </div>
        </dl>
      </ListCard>
      {error && <ApiFeedback error={error} onRetry={reload} />}
      <Summary value={run.summary} label="Tổng toàn bộ bảng lương" />
      <ItemList
        filters={filters}
        onFilters={setFilters}
        data={items.data?.content ?? []}
        total={items.data?.totalElements ?? 0}
        summary={items.data?.filteredSummary}
        loading={items.loading}
        error={items.error}
        onReload={items.reload}
      />
      {confirm && (
        <ConfirmDrawer
          title="Công bố bảng lương"
          busy={busy}
          onClose={() => {
            if (!writing.current) setConfirm(false);
          }}
          onConfirm={() => void publish()}
          label="Xác nhận công bố"
        >
          <p>
            Bạn muốn công bố bảng lương{" "}
            <strong>{periodLabel(run.period)}</strong> cho{" "}
            <strong>{run.summary.employeeCount} nhân viên</strong>?
          </p>
          <p>
            Tổng thực nhận:{" "}
            <strong>{formatVnd(run.summary.totalNetSalary)}</strong>. Sau khi
            công bố, nhân viên được xem phiếu lương cá nhân; bảng lương không
            thể chỉnh sửa trên màn hình này.
          </p>
        </ConfirmDrawer>
      )}
    </>
  );
}

function PreviewPanel({
  onBusy,
  onCreated,
}: {
  onBusy: (value: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const [period, setPeriod] = useState(() => lastClosedMonth());
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "create" | "">("");
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [page, setPage] = useState(0);
  const writing = useRef(false);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const ready = !invalid && canConfirmPayroll(preview, period, now);
  async function load() {
    if (writing.current) return;
    writing.current = true;
    setBusy("preview");
    onBusy(true);
    setError("");
    setPreview(null);
    setInvalid(false);
    setPage(0);
    try {
      const result = await previewPayroll(period);
      setPreview(result);
      setNow(Date.now());
    } catch (err) {
      setError(payrollErrorMessage(err));
    } finally {
      writing.current = false;
      setBusy("");
      onBusy(false);
    }
  }
  async function create() {
    // Recheck time at click, not just at the last render/timer tick.
    if (
      writing.current ||
      invalid ||
      !canConfirmPayroll(preview, period) ||
      !preview
    )
      return;
    writing.current = true;
    setBusy("create");
    onBusy(true);
    setError("");
    try {
      const result = await confirmPayroll(preview.previewToken);
      onCreated(result.id);
    } catch (err) {
      setError(payrollErrorMessage(err, true));
      setInvalid(true);
      setConfirm(false);
    } finally {
      writing.current = false;
      setBusy("");
      onBusy(false);
    }
  }
  return (
    <>
      <ListCard
        title="Tạo bảng lương tháng"
        description="Xem trước và kiểm tra trước khi lưu"
        actions={null}
      >
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <div className="w-52">
            <FormField label="Kỳ lương">
              <input
                type="month"
                required
                className={inputClass}
                max={lastClosedMonth()}
                value={period}
                disabled={Boolean(busy)}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  setPreview(null);
                  setConfirm(false);
                  setError("");
                  setInvalid(false);
                }}
              />
            </FormField>
          </div>
          <button
            type="submit"
            className={primary}
            disabled={Boolean(busy) || !period}
          >
            {busy === "preview" ? "Đang tính..." : "Xem trước bảng lương"}
          </button>
          <Link className={button} href="/salary-profiles">
            Thông tin lương nhân viên
          </Link>
        </form>
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          Chọn kỳ đã kết thúc. Lương, phụ cấp và khấu trừ được tính theo công
          hưởng lương; số liệu do hệ thống tính và không chỉnh sửa trực tiếp tại
          đây.
        </p>
      </ListCard>
      {error && <ApiFeedback error={error} />}
      {preview && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-white p-4">
            <div>
              <h2 className="font-semibold">
                Bản xem trước {periodLabel(preview)}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Công chuẩn: {preview.workStandard.standardWorkingDays ?? "—"}{" "}
                ngày · {preview.workStandard.standardMinutesPerDay ?? "—"}{" "}
                phút/ngày. Hết hạn: {dateTime(preview.expiresAt)}
              </p>
            </div>
            <button
              type="button"
              className={primary}
              disabled={!ready || Boolean(busy)}
              onClick={() => setConfirm(true)}
            >
              Xác nhận tạo bảng lương
            </button>
          </div>
          {!ready && !invalid && (
            <ApiFeedback
              error={
                Date.parse(preview.expiresAt) <= now
                  ? "Bản xem trước đã hết hạn. Vui lòng xem trước lại."
                  : "Chưa đủ điều kiện tạo bảng lương. Vui lòng xử lý các vấn đề bên dưới và xem trước lại."
              }
            />
          )}
          {preview.issues.length > 0 && (
            <section
              aria-label="Vấn đề cần kiểm tra"
              className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm"
            >
              <h3 className="font-semibold">
                Vấn đề cần kiểm tra ({preview.issues.length})
              </h3>
              <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto">
                {preview.issues.map((issue, index) => (
                  <li key={index} className="break-words">
                    <span className="font-medium">
                      {issue.severity.toUpperCase() === "ERROR"
                        ? "Cần xử lý"
                        : "Lưu ý"}
                      {issue.employee
                        ? ` · ${issue.employee.employeeCode} – ${issue.employee.fullName}`
                        : ""}
                      {issue.date ? ` · ${issue.date}` : ""}:{" "}
                    </span>
                    {issue.message}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs">
                Kiểm tra hồ sơ lương, dữ liệu chấm công và các đơn nghỉ phép còn
                chờ duyệt. Thiếu công chuẩn cần liên hệ người cấu hình hệ thống.
              </p>
            </section>
          )}
          <Summary value={preview.summary} label="Tổng bản xem trước" />
          <ListCard
            title="Chi tiết dự kiến"
            description={`${preview.items.length} nhân viên trong bản xem trước`}
            actions={null}
            footer={
              <TableFooter
                total={preview.items.length}
                page={page + 1}
                pageSize={10}
                onPage={(value) => setPage(value - 1)}
              />
            }
          >
            <ItemsTable
              rows={preview.items.slice(page * 10, (page + 1) * 10)}
              loading={false}
              error=""
            />
          </ListCard>
        </>
      )}
      {confirm && preview && (
        <ConfirmDrawer
          title="Xác nhận tạo bảng lương"
          busy={Boolean(busy)}
          disabled={!ready}
          onClose={() => {
            if (!writing.current) setConfirm(false);
          }}
          onConfirm={() => void create()}
          label="Tạo bảng lương"
        >
          <p>
            Tạo bảng lương <strong>{periodLabel(preview)}</strong> cho{" "}
            <strong>{preview.summary.employeeCount} nhân viên</strong>, tổng
            thực nhận{" "}
            <strong>{formatVnd(preview.summary.totalNetSalary)}</strong>?
          </p>
          <p>
            Bảng lương được lưu theo dữ liệu đã xem trước. Bạn sẽ kiểm tra lại
            và công bố ở bước tiếp theo.
          </p>
          {!ready && (
            <ApiFeedback error="Bản xem trước không còn khả dụng. Hãy đóng hộp thoại và xem trước lại." />
          )}
        </ConfirmDrawer>
      )}
    </>
  );
}

function ItemList({
  filters,
  onFilters,
  data,
  total,
  summary,
  loading,
  error,
  onReload,
}: {
  filters: PayrollItemFilters;
  onFilters: (value: PayrollItemFilters) => void;
  data: PayrollItem[];
  total: number;
  summary?: PayrollSummary;
  loading: boolean;
  error: string;
  onReload: () => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchAll<CatalogRecord>("/departments", {}, signal),
    [],
  );
  const departments = useApiResource(load);
  const update = (next: Partial<PayrollItemFilters>) =>
    onFilters({ ...filters, ...next, page: 0 });
  return (
    <>
      {summary && (
        <Summary value={summary} label="Tổng theo bộ lọc (toàn bộ kết quả)" />
      )}
      <ListCard
        title="Lương từng nhân viên"
        description="Tìm kiếm trên dữ liệu đã lưu của kỳ lương"
        actions={
          <FilterBar
            query={filters.q}
            onQuery={(q) => update({ q: q.slice(0, 100) })}
            placeholder="Tìm mã hoặc tên nhân viên"
            filters={[
              {
                label: "Mọi phòng ban",
                value: filters.departmentId,
                options: (departments.data ?? []).map((d) => ({
                  value: String(d.id),
                  label: d.name,
                })),
                onChange: (departmentId) => update({ departmentId }),
              },
            ]}
            onReload={onReload}
          />
        }
        footer={
          <TableFooter
            total={total}
            page={filters.page + 1}
            pageSize={filters.size}
            onPage={(page) => onFilters({ ...filters, page: page - 1 })}
          />
        }
      >
        <div className="flex justify-end border-b border-border p-3">
          <button
            type="button"
            className={button}
            onClick={() => onFilters(initialItemFilters)}
          >
            Xóa bộ lọc
          </button>
        </div>
        {departments.error && (
          <div className="p-4">
            <ApiFeedback
              error="Không thể tải bộ lọc phòng ban."
              onRetry={departments.reload}
            />
          </div>
        )}
        {error && (
          <div className="p-4">
            <ApiFeedback error={error} onRetry={onReload} />
          </div>
        )}
        <ItemsTable rows={data} loading={loading} error={error} />
      </ListCard>
    </>
  );
}

function ItemsTable({
  rows,
  loading,
  error,
}: {
  rows: PayrollItem[];
  loading: boolean;
  error: string;
}) {
  const [selected, setSelected] = useState<PayrollItem | null>(null);
  // The drawer may only use the current result set, never a previous query's snapshot.
  const visible =
    selected && !loading && !error && rows.includes(selected) ? selected : null;
  return (
    <>
      <div className="overflow-x-auto">
        <table className={tableClass} aria-label="Chi tiết lương nhân viên">
          <thead className="bg-muted/40">
            <tr>
              <th>Nhân viên</th>
              <th>Phòng ban</th>
              <th className="text-right">Công hưởng lương</th>
              <th className="text-right">Lương theo công</th>
              <th className="text-right">Phụ cấp</th>
              <th className="text-right">Khấu trừ</th>
              <th className="text-right">Thực nhận</th>
              <th className="text-right">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow columns={8} />
            ) : !error && !rows.length ? (
              <EmptyRow columns={8} />
            ) : (
              rows.map((item) => (
                <tr key={item.employee.id}>
                  <td>
                    <p className="font-medium">{item.employee.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.employee.employeeCode}
                    </p>
                  </td>
                  <td>{item.employee.department?.name || "Chưa phân công"}</td>
                  <td className="text-right tabular-nums">
                    {workNumber(item.work.paidWorkingDays)}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatVnd(item.amounts.earnedBaseSalary)}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatVnd(item.amounts.earnedAllowance)}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatVnd(item.amounts.earnedDeduction)}
                  </td>
                  <td className="text-right font-semibold tabular-nums">
                    {formatVnd(item.amounts.netSalary)}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className={button}
                      aria-label={`Chi tiết lương ${item.employee.employeeCode}`}
                      onClick={() => setSelected(item)}
                    >
                      <Eye className="size-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {visible && (
        <Drawer
          title={`Lương ${visible.employee.employeeCode}`}
          onClose={() => setSelected(null)}
        >
          <div className="space-y-5 p-5">
            <div>
              <h3 className="font-semibold">{visible.employee.fullName}</h3>
              <p className="text-sm text-muted-foreground">
                {visible.employee.department?.name || "Chưa phân công"}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["Công chuẩn (ngày)", visible.work.standardWorkingDays ?? "—"],
                [
                  "Phút công chuẩn/ngày",
                  visible.work.standardMinutesPerDay ?? "—",
                ],
                ["Phút hưởng lương", visible.work.paidMinutes ?? "—"],
                [
                  "Công hưởng lương (ngày)",
                  workNumber(visible.work.paidWorkingDays),
                ],
                [
                  "Lương cơ bản/tháng",
                  formatVnd(visible.amounts.baseSalaryMonthly),
                ],
                ["Phụ cấp/tháng", formatVnd(visible.amounts.allowanceMonthly)],
                ["Khấu trừ/tháng", formatVnd(visible.amounts.deductionMonthly)],
                [
                  "Lương theo công",
                  formatVnd(visible.amounts.earnedBaseSalary),
                ],
                [
                  "Phụ cấp theo công",
                  formatVnd(visible.amounts.earnedAllowance),
                ],
                [
                  "Khấu trừ theo công",
                  formatVnd(visible.amounts.earnedDeduction),
                ],
                ["Thực nhận", formatVnd(visible.amounts.netSalary)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words font-medium tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Số tiền lấy từ kết quả tính lương của hệ thống, không tính lại từ
              danh sách đang hiển thị.
            </p>
          </div>
        </Drawer>
      )}
    </>
  );
}

function ConfirmDrawer({
  title,
  children,
  busy,
  disabled,
  label,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  disabled?: boolean;
  label: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Drawer title={title} onClose={onClose} busy={busy}>
      <div className="space-y-4 p-5 text-sm leading-6">{children}</div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={onClose}
        >
          Hủy
        </button>
        <button
          type="button"
          className={primary}
          disabled={busy || disabled}
          onClick={onConfirm}
        >
          {busy ? "Đang xử lý..." : label}
        </button>
      </div>
    </Drawer>
  );
}
