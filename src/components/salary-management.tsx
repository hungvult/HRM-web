"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CalendarDays, LockKeyhole, Plus } from "lucide-react";
import HrmAppShell from "@/components/hrm-app-shell";
import { ApiFeedback, LoadingRow } from "@/components/api-feedback";
import {
  Drawer,
  EmptyRow,
  FilterBar,
  FormActions,
  FormField,
  ListCard,
  RowActions,
  TableFooter,
  inputClass,
  tableClass,
} from "@/components/hrm-ui";
import { fetchAll, fetchMyProfile, type CatalogRecord } from "@/lib/hrm-api";
import { formatDate } from "@/lib/hrm-format";
import { useApiResource } from "@/lib/use-api-resource";
import { focusFirstError } from "@/lib/form-validation";
import {
  canManageSalary,
  fetchSalaryEmployees,
  fetchSalaryHistory,
  formatSalaryInput,
  formatVnd,
  salaryErrorCode,
  salaryErrorMessage,
  salaryFieldErrors,
  salaryStateLabels,
  saveSalaryProfile,
  validateSalaryForm,
  type SalaryEmployee,
  type SalaryFilters,
  type SalaryFormErrors,
  type SalaryFormValues,
  type SalaryHistoryItem,
  type SalaryState,
} from "@/lib/salary-profiles";

type DialogState = {
  mode: "detail" | "create" | "edit";
  employee?: SalaryEmployee;
  profile?: SalaryHistoryItem;
};
const buttonClass =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50";
const initialFilters: SalaryFilters = {
  q: "",
  departmentId: "",
  profileState: "",
  page: 0,
  size: 10,
};

export default function SalaryManagement() {
  const session = useApiResource(fetchMyProfile);
  const allowed = canManageSalary(session.data);
  const [filters, setFilters] = useState<SalaryFilters>(initialFilters);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [notice, setNotice] = useState("");
  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        return await fetchSalaryEmployees(filters, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        throw new Error(salaryErrorMessage(error));
      }
    },
    [filters],
  );
  const list = useApiResource(load, allowed);
  const loadDepartments = useCallback(
    (signal: AbortSignal) =>
      fetchAll<CatalogRecord>("/departments", {}, signal),
    [],
  );
  const departments = useApiResource(loadDepartments, allowed);
  const update = (next: Partial<SalaryFilters>) =>
    setFilters((current) => ({ ...current, ...next, page: 0 }));
  const close = () => setDialog(null);

  return (
    <HrmAppShell
      activeLabel="Quản lý lương"
      title="Quản lý lương nhân viên"
      description="Mức lương và lịch sử hiệu lực của từng nhân viên"
      user={session.data}
      actionLabel={allowed ? "Thêm mốc lương" : undefined}
      onAction={() => {
        setNotice("");
        setDialog({ mode: "create" });
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
        <ApiFeedback error="Chỉ nhân sự (HR) được quản lý thông tin lương nhân viên." />
      ) : (
        <>
          {notice && (
            <p
              role="status"
              className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              {notice}
            </p>
          )}
          <ListCard
            title="Thông tin lương nhân viên"
            description={
              list.loading
                ? "Đang tải danh sách..."
                : `${list.data?.totalElements ?? 0} nhân viên phù hợp`
            }
            actions={
              <FilterBar
                query={filters.q}
                onQuery={(q) => update({ q: q.slice(0, 100) })}
                placeholder="Tìm mã hoặc tên nhân viên"
                filters={[
                  {
                    label: "Mọi phòng ban",
                    value: filters.departmentId,
                    options: (departments.data ?? []).map((item) => ({
                      value: String(item.id),
                      label: item.name,
                    })),
                    onChange: (departmentId) => update({ departmentId }),
                  },
                  {
                    label: "Mọi trạng thái lương",
                    value: filters.profileState,
                    options: Object.entries(salaryStateLabels).map(
                      ([value, label]) => ({ value, label }),
                    ),
                    onChange: (profileState) => update({ profileState }),
                  },
                ]}
                onReload={list.reload}
              />
            }
            footer={
              <TableFooter
                total={list.data?.totalElements ?? 0}
                page={filters.page + 1}
                pageSize={filters.size}
                onPage={(page) =>
                  setFilters((current) => ({ ...current, page: page - 1 }))
                }
              />
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-xs text-muted-foreground">
              <p>
                Số tiền theo tháng, đơn vị VND. Lương thực nhận được tính tại
                bảng lương tháng.
              </p>
              <button
                type="button"
                className={buttonClass}
                onClick={() => setFilters(initialFilters)}
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
            {list.error && (
              <div className="p-4">
                <ApiFeedback error={list.error} onRetry={list.reload} />
              </div>
            )}
            <div className="overflow-x-auto">
              <table
                className={tableClass}
                aria-label="Thông tin lương nhân viên"
              >
                <thead className="bg-muted/40">
                  <tr>
                    <th>Nhân viên</th>
                    <th>Phòng ban</th>
                    <th className="text-right">Lương cơ bản</th>
                    <th className="text-right">Phụ cấp</th>
                    <th className="text-right">Khấu trừ</th>
                    <th>Hiệu lực từ</th>
                    <th>Trạng thái</th>
                    <th className="text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {list.loading ? (
                    <LoadingRow columns={8} />
                  ) : list.error ? null : !list.data?.content.length ? (
                    <EmptyRow columns={8} />
                  ) : (
                    list.data.content.map((row) => (
                      <tr key={row.employee.id}>
                        <td>
                          <p className="font-medium">{row.employee.fullName}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.employee.employeeCode}
                          </p>
                        </td>
                        <td>
                          {row.employee.department?.name ?? "Chưa phân công"}
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums font-medium">
                          {formatVnd(row.currentProfile?.baseSalary)}
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {formatVnd(row.currentProfile?.allowance)}
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {formatVnd(row.currentProfile?.deduction)}
                        </td>
                        <td className="whitespace-nowrap">
                          {row.currentProfile
                            ? formatDate(row.currentProfile.effectiveFrom)
                            : "—"}
                        </td>
                        <td>
                          <SalaryBadge state={row.profileState} />
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-2">
                            <RowActions
                              name={row.employee.fullName}
                              onView={() =>
                                setDialog({
                                  mode: "detail",
                                  employee: row.employee,
                                })
                              }
                            />
                            <button
                              type="button"
                              aria-label={`Thêm mốc lương ${row.employee.fullName}`}
                              title="Thêm mốc lương"
                              className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-primary hover:bg-primary/5"
                              onClick={() => {
                                setNotice("");
                                setDialog({
                                  mode: "create",
                                  employee: row.employee,
                                });
                              }}
                            >
                              <Plus className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </ListCard>
          {dialog?.mode === "detail" && dialog.employee && (
            <SalaryHistoryDrawer
              employee={dialog.employee}
              onClose={close}
              onCreate={() =>
                setDialog({ mode: "create", employee: dialog.employee })
              }
              onEdit={(profile) =>
                setDialog({ mode: "edit", employee: dialog.employee, profile })
              }
            />
          )}
          {dialog && dialog.mode !== "detail" && (
            <SalaryForm
              key={`${dialog.employee?.id ?? "new"}-${dialog.profile?.id ?? "create"}`}
              initialEmployee={dialog.employee}
              profile={dialog.profile}
              onClose={close}
              onSaved={(employee) => {
                setNotice("Đã lưu thông tin lương thành công.");
                  // A new profile may remove the last row from a filtered page.
                  setFilters((current) => ({ ...current, page: 0 }));
                list.reload();
                setDialog({ mode: "detail", employee });
              }}
            />
          )}
        </>
      )}
    </HrmAppShell>
  );
}

function SalaryBadge({ state }: { state: SalaryState }) {
  const tone =
    state === "CURRENT"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : state === "FUTURE"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {salaryStateLabels[state] ?? "Không xác định"}
    </span>
  );
}

function EmployeeHeading({ employee }: { employee: SalaryEmployee }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-4">
      <p className="font-display font-semibold">{employee.fullName}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {employee.employeeCode} ·{" "}
        {employee.department?.name ?? "Chưa phân công"}
      </p>
    </div>
  );
}

function SalaryHistoryDrawer({
  employee,
  onClose,
  onCreate,
  onEdit,
}: {
  employee: SalaryEmployee;
  onClose: () => void;
  onCreate: () => void;
  onEdit: (profile: SalaryHistoryItem) => void;
}) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        return await fetchSalaryHistory(employee.id, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        throw new Error(salaryErrorMessage(error));
      }
    },
    [employee.id],
  );
  const history = useApiResource(load);
  return (
    <Drawer title="Chi tiết thông tin lương" onClose={onClose}>
      <div className="space-y-5">
        <EmployeeHeading employee={history.data?.employee ?? employee} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-semibold">Lịch sử mốc lương</h3>
          <button type="button" className={buttonClass} onClick={onCreate}>
            <Plus className="size-4" />
            Thêm mốc lương
          </button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Mỗi mốc áp dụng từ ngày đầu tháng. Mốc đã dùng trong bảng lương được
          giữ lại và không thể chỉnh sửa.
        </p>
        {history.loading ? (
          <p
            role="status"
            className="py-8 text-center text-sm text-muted-foreground"
          >
            Đang tải lịch sử lương...
          </p>
        ) : history.error ? (
          <ApiFeedback error={history.error} onRetry={history.reload} />
        ) : !history.data?.profiles.length ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <p className="font-medium">Chưa có thông tin lương</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Thêm mốc lương đầu tiên để chuẩn bị tính lương cho nhân viên.
            </p>
          </div>
        ) : (
          history.data.profiles.map((profile) => (
            <article
              key={profile.id}
              className="overflow-hidden rounded-md border border-border"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarDays className="size-4 text-primary" />
                  {formatDate(profile.effectiveFrom)} —{" "}
                  {profile.effectiveTo
                    ? formatDate(profile.effectiveTo)
                    : "Chưa có ngày kết thúc"}
                </p>
                {profile.editable ? (
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10"
                    onClick={() => onEdit(profile)}
                    aria-label={`Chỉnh sửa mốc ${formatDate(profile.effectiveFrom)}`}
                  >
                    Chỉnh sửa
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <LockKeyhole className="size-3.5" />
                    Đã dùng tính lương
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
                {(
                  [
                    ["Lương cơ bản", profile.baseSalary],
                    ["Phụ cấp", profile.allowance],
                    ["Khấu trừ", profile.deduction],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-semibold tabular-nums">
                      {formatVnd(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                Cập nhật: {formatDate(profile.updatedAt)}
              </p>
            </article>
          ))
        )}
        <FormActions readOnly onClose={onClose} />
      </div>
    </Drawer>
  );
}

function SalaryForm({
  initialEmployee,
  profile,
  onClose,
  onSaved,
}: {
  initialEmployee?: SalaryEmployee;
  profile?: SalaryHistoryItem;
  onClose: () => void;
  onSaved: (employee: SalaryEmployee) => void;
}) {
  const [employee, setEmployee] = useState(initialEmployee ?? null);
  const [query, setQuery] = useState("");
  const [pickerPage, setPickerPage] = useState(0);
  const [values, setValues] = useState<SalaryFormValues>({
    effectiveFrom: profile?.effectiveFrom ?? "",
    baseSalary: profile ? formatSalaryInput(String(profile.baseSalary)) : "",
    allowance: profile ? formatSalaryInput(String(profile.allowance)) : "0",
    deduction: profile ? formatSalaryInput(String(profile.deduction)) : "0",
  });
  const [errors, setErrors] = useState<SalaryFormErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(profile?.editable === false);
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const loadPicker = useCallback(
    async (signal: AbortSignal) => {
      try {
        return await fetchSalaryEmployees(
          { ...initialFilters, q: query, page: pickerPage, size: 5 },
          signal,
        );
      } catch (err) {
        if (signal.aborted) throw err;
        throw new Error(salaryErrorMessage(err));
      }
    },
    [query, pickerPage],
  );
  const picker = useApiResource(loadPicker, !employee);
  const change = (field: keyof SalaryFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setError("");
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || locked) return;
    const validation = validateSalaryForm(values, employee?.id);
    setErrors(validation);
    setError("");
    if (Object.keys(validation).length) {
      focusFirstError(event.currentTarget, validation);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      await saveSalaryProfile(
        employee!.id,
        values,
        profile?.id,
        controller.signal,
      );
      if (!controller.signal.aborted) onSaved(employee!);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(salaryErrorMessage(err, true));
        setErrors(salaryFieldErrors(err));
        if (salaryErrorCode(err) === "SALARY_PROFILE_LOCKED") setLocked(true);
      }
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <Drawer
      title={profile ? "Cập nhật mốc lương" : "Thêm mốc lương"}
      onClose={onClose}
      busy={busy}
    >
      <form noValidate onSubmit={submit} className="space-y-5">
        {employee ? (
          <EmployeeHeading employee={employee} />
        ) : (
          <section className="space-y-3" aria-label="Chọn nhân viên">
            <FormField label="Tìm và chọn nhân viên" error={errors.employeeId}>
              <input
                name="employeeId"
                className={inputClass}
                value={query}
                maxLength={100}
                placeholder="Nhập mã hoặc họ tên"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPickerPage(0);
                }}
              />
            </FormField>
            {picker.error && (
              <ApiFeedback error={picker.error} onRetry={picker.reload} />
            )}
            {picker.loading ? (
              <p role="status" className="text-sm text-muted-foreground">
                Đang tìm nhân viên...
              </p>
            ) : !picker.error && !picker.data?.content.length ? (
              <p className="text-sm text-muted-foreground">
                Không tìm thấy nhân viên phù hợp.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {picker.data?.content.map((row) => (
                  <li key={row.employee.id}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left hover:bg-primary/5"
                      onClick={() => {
                        setEmployee(row.employee);
                        setErrors({});
                      }}
                      aria-label={`Chọn ${row.employee.employeeCode} ${row.employee.fullName}`}
                    >
                      <span>
                        <span className="block text-sm font-medium">
                          {row.employee.fullName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {row.employee.employeeCode} ·{" "}
                          {row.employee.department?.name ?? "Chưa phân công"}
                        </span>
                      </span>
                      <SalaryBadge state={row.profileState} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {picker.data && (
              <TableFooter
                total={picker.data.totalElements}
                page={pickerPage + 1}
                pageSize={5}
                onPage={(page) => setPickerPage(page - 1)}
              />
            )}
          </section>
        )}
        {employee && !initialEmployee && (
          <button
            type="button"
            disabled={busy}
            className="text-sm font-medium text-primary"
            onClick={() => {
              setEmployee(null);
              setError("");
            }}
          >
            Chọn nhân viên khác
          </button>
        )}
        <p className="rounded-md border border-primary/15 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
          Nhập mức tiền cho đủ công tháng. Ngày hiệu lực là ngày đầu tháng; thêm
          mốc mới sẽ tự khép khoảng hiệu lực liền trước. Lương thực nhận được
          tính theo công hưởng lương trong bảng lương tháng.
        </p>
        <ApiFeedback error={error} />
        {locked && (
          <p className="text-sm text-muted-foreground">
            Mốc này chỉ được xem. Đóng form và tải lại lịch sử để xem trạng thái
            mới nhất.
          </p>
        )}
        <fieldset
          disabled={busy || locked}
          className="space-y-4 disabled:opacity-70"
        >
          <FormField label="Ngày hiệu lực từ" error={errors.effectiveFrom}>
            <input
              name="effectiveFrom"
              type="date"
              className={inputClass}
              value={values.effectiveFrom}
              onChange={(event) => change("effectiveFrom", event.target.value)}
            />
          </FormField>
          {(
            [
              ["baseSalary", "Lương cơ bản (VND)"],
              ["allowance", "Phụ cấp (VND)"],
              ["deduction", "Khấu trừ (VND)"],
            ] as const
          ).map(([field, label]) => (
            <FormField key={field} label={label} error={errors[field]}>
              <input
                name={field}
                type="text"
                inputMode="numeric"
                maxLength={20}
                className={inputClass + " tabular-nums"}
                value={values[field]}
                placeholder={field === "baseSalary" ? "Ví dụ: 16.000.000" : "0"}
                onChange={(event) => change(field, event.target.value)}
                onBlur={() =>
                  setValues((current) => ({
                    ...current,
                    [field]: formatSalaryInput(current[field]),
                  }))
                }
              />
            </FormField>
          ))}
        </fieldset>
        <FormActions onClose={onClose} busy={busy} readOnly={locked} />
      </form>
    </Drawer>
  );
}
