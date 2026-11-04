"use client";

import { CalendarDays, IdCard, ShieldCheck, UsersRound } from "lucide-react";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationDialog, OperationFeedback } from "@/components/operation-dialog";
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
  StatisticSummary,
  StatusBadge,
  TableFooter,
  inputClass,
  tableClass,
} from "@/components/hrm-ui";
import {
  canManageHrm,
  changeEmployeeStatus,
  employmentLabels,
  fetchAll,
  fetchEmployee,
  fetchEmployees,
  fetchMyProfile,
  genderLabels,
  getOperationErrorMessage,
  saveEmployee,
  type CatalogRecord,
  type EmployeeGender,
  type EmployeeRecord,
  type EmploymentStatus,
} from "@/lib/hrm-api";
import { formatDate } from "@/lib/hrm-format";
import { useApiResource } from "@/lib/use-api-resource";
import {
  focusFirstError,
  validateForm,
  type FormErrors,
} from "@/lib/form-validation";

type Mode = "create" | "edit" | "view" | "status";
const fieldLabels = {
  fullName: "Họ tên",
  email: "Email",
  phone: "Số điện thoại",
  hireDate: "Ngày vào làm",
  dateOfBirth: "Ngày sinh",
  address: "Địa chỉ",
  reason: "Lý do thay đổi",
};
const blank: EmployeeRecord = {
  id: 0,
  employeeCode: "",
  fullName: "",
  email: "",
  phone: "",
  hireDate: "",
  employmentStatus: "WORKING",
};
async function loadOptions(signal: AbortSignal) {
  const [departments, positions] = await Promise.all([
    fetchAll<CatalogRecord>("/departments", {}, signal),
    fetchAll<CatalogRecord>("/positions", {}, signal),
  ]);
  return { departments, positions };
}
async function loadStats(signal: AbortSignal) {
  const results = await Promise.all([
    fetchEmployees({ size: 1 }, signal),
    ...(["WORKING", "ON_LEAVE", "TERMINATED"] as const).map(
      (employmentStatus) =>
        fetchEmployees({ size: 1, employmentStatus }, signal),
    ),
  ]);
  return results.map((result) => result.totalElements);
}
export default function EmployeeManagementPage() {
  const session = useApiResource(fetchMyProfile);
  const router = useRouter();
  const writeLock = useRef(false);
  const [statusDraft, setStatusDraft] = useState<{ id: number; name: string; status: EmploymentStatus; reason: string } | null>(null);
  const [operationError, setOperationError] = useState("");
  const allowed = canManageHrm(session.data);
  const [query, setQuery] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{
    mode: Mode;
    item: EmployeeRecord;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState("");
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchEmployees(
        {
          q: query,
          departmentId,
          positionId,
          employmentStatus: status,
          page: page - 1,
          size: 8,
        },
        signal,
      ),
    [query, departmentId, positionId, status, page],
  );
  const resource = useApiResource(load, allowed);
  const options = useApiResource(loadOptions, allowed);
  const stats = useApiResource(loadStats, allowed);
  const loadDetail = useCallback(
    (signal: AbortSignal) => fetchEmployee(dialog?.item.id ?? 0, signal),
    [dialog?.item.id],
  );
  const needsDetail = !!dialog && ["edit", "view", "status"].includes(dialog.mode);
  const detail = useApiResource(loadDetail, allowed && needsDetail);
  const rows = resource.data?.content ?? [];
  const error =
    session.error ||
    (session.data && !allowed
      ? "Bạn không có quyền quản lý hồ sơ nhân viên."
      : resource.error || options.error || stats.error);
  const loading = session.loading || (allowed && resource.loading);
  const item = needsDetail
    ? (detail.data ?? dialog?.item ?? blank)
    : (dialog?.item ?? blank);
  function open(mode: Mode, employee = blank) {
    setFieldErrors({});
    setFormError("");
    setNotice("");
    setDialog({ mode, item: employee });
  }
  function close() {
    if (!saving) {
      setDialog(null);
      setFieldErrors({});
      setFormError("");
    }
  }
  function reload() {
    resource.reload();
    stats.reload();
    options.reload();
  }
  // Nhận form tạo/sửa hồ sơ; employeeId lấy từ dòng đã chọn, chỉ trạng thái mới cần xác nhận riêng trước PATCH.
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || saving || !allowed || dialog.mode === "view") return;
    if (needsDetail && (detail.loading || detail.error || !detail.data)) return;
    const errors = validateForm(event.currentTarget, fieldLabels);
    setFieldErrors(errors);
    setFormError("");
    if (Object.keys(errors).length) {
      focusFirstError(event.currentTarget, errors);
      return;
    }
    const form = new FormData(event.currentTarget);
    setFormError("");
    const text = (key: string) => String(form.get(key) ?? "").trim();
    if (
      dialog.mode === "status" &&
      text("employmentStatus") === item.employmentStatus
    ) {
      setFormError("Vui lòng chọn trạng thái khác hiện tại.");
      return;
    }
    if (
      dialog.mode !== "status" &&
      text("dateOfBirth") &&
      text("dateOfBirth") >= text("hireDate")
    ) {
      setFormError("Ngày sinh phải trước ngày vào làm.");
      return;
    }
    // UC004 yêu cầu xác nhận trạng thái: chuẩn bị bản nháp, chưa PATCH employees.
    if (dialog.mode === "status") {
      setStatusDraft({ id: item.id, name: item.fullName, status: text("employmentStatus") as EmploymentStatus, reason: text("reason") });
      return;
    }
    if (writeLock.current) return;
    writeLock.current = true;
    setSaving(true);
    try {
      {
        await saveEmployee(
          {
            fullName: text("fullName"),
            email: text("email"),
            phone: text("phone"),
            hireDate: text("hireDate"),
            dateOfBirth: text("dateOfBirth") || undefined,
            gender: (text("gender") || undefined) as EmployeeGender | undefined,
            address: text("address"),
          },
          dialog.mode === "edit" ? dialog.item.id : undefined,
        );
      }
      setDialog(null);
      setPage(1);
      setNotice("Đã lưu hồ sơ lên hệ thống.");
      reload();
    } catch (apiError) {
      setOperationError(getOperationErrorMessage(apiError));
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  }
  /** Xác nhận mới đổi employees.employment_status; hủy chỉ đóng hộp, giữ nguyên form. */
  async function confirmStatus() {
    if (!statusDraft || !allowed || writeLock.current) return;
    writeLock.current = true;
    setSaving(true);
    try {
      await changeEmployeeStatus(statusDraft.id, statusDraft.status, statusDraft.reason);
      setStatusDraft(null);
      setDialog(null);
      setNotice("Đã cập nhật trạng thái làm việc thành công.");
      reload();
    } catch (error) {
      setStatusDraft(null);
      setOperationError(getOperationErrorMessage(error));
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  }
  return (
    <HrmAppShell
      user={session.data}
      activeLabel="Hồ sơ nhân viên"
      title="Quản lý hồ sơ nhân viên"
      description="Thông tin và trạng thái làm việc"
      actionLabel={allowed ? "Tạo hồ sơ" : undefined}
      onAction={() => open("create")}
      actionDisabled={saving || loading || !!error}
    >
      <StatisticSummary
        items={["Tổng hồ sơ", "Đang làm", "Tạm nghỉ", "Nghỉ việc"].map(
          (label, index) => ({
            label,
            value: stats.data ? String(stats.data[index]) : "-",
            detail: "Hồ sơ trong hệ thống",
            icon: [UsersRound, ShieldCheck, CalendarDays, IdCard][index],
          }),
        )}
      />
      <ApiFeedback
        error={error}
        onRetry={() => {
          session.reload();
          reload();
        }}
      />
      <ListCard
        title="Danh sách hồ sơ"
        description="Thông tin liên hệ và đơn vị"
        actions={
          <FilterBar
            query={query}
            onQuery={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Mã, họ tên hoặc email"
            onReload={reload}
            filters={[
              {
                label: "Mọi phòng ban",
                value: departmentId,
                options: (options.data?.departments ?? []).map(
                  (department) => ({
                    value: String(department.id),
                    label: department.name,
                  }),
                ),
                onChange: (value) => {
                  setDepartmentId(value);
                  setPage(1);
                },
              },
              {
                label: "Mọi chức vụ",
                value: positionId,
                options: (options.data?.positions ?? []).map((position) => ({
                  value: String(position.id),
                  label: position.name,
                })),
                onChange: (value) => {
                  setPositionId(value);
                  setPage(1);
                },
              },
              {
                label: "Mọi trạng thái",
                value: status,
                options: Object.entries(employmentLabels).map(
                  ([value, label]) => ({ value, label }),
                ),
                onChange: (value) => {
                  setStatus(value);
                  setPage(1);
                },
              },
            ]}
          />
        }
        footer={
          <TableFooter
            total={resource.data?.totalElements ?? 0}
            page={page}
            onPage={setPage}
          />
        }
      >
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr className="border-b border-border bg-muted/55 text-[0.68rem] uppercase text-muted-foreground">
                {[
                  "Nhân viên",
                  "Liên hệ",
                  "Phòng ban / Chức vụ",
                  "Ngày vào làm",
                  "Trạng thái",
                  "Thao tác",
                ].map((label) => (
                  <th
                    key={label}
                    className={label === "Thao tác" ? "text-right" : ""}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow columns={6} />
              ) : (
                rows.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <p className="font-semibold">{employee.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {employee.employeeCode}
                      </p>
                    </td>
                    <td>
                      <p>{employee.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {employee.phone}
                      </p>
                    </td>
                    <td>
                      <p>{employee.department?.name || "Chưa phân công"}</p>
                      <p className="text-xs text-muted-foreground">
                        {employee.position?.name || "-"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap">
                      {formatDate(employee.hireDate)}
                    </td>
                    <td>
                      <StatusBadge
                        label={employmentLabels[employee.employmentStatus]}
                      />
                    </td>
                    <td>
                      <RowActions
                        name={employee.fullName}
                        onView={() => open("view", employee)}
                        onEdit={
                          allowed ? () => open("edit", employee) : undefined
                        }
                        statusLabel="Đổi trạng thái làm việc"
                        onAssign={allowed ? () => router.push(`/assignments?employeeId=${employee.id}`) : undefined}
                        onStatus={
                          allowed ? () => open("status", employee) : undefined
                        }
                      />
                    </td>
                  </tr>
                ))
              )}
              {!loading && !rows.length && <EmptyRow columns={6} />}
            </tbody>
          </table>
        </div>
      </ListCard>
      <OperationFeedback message={notice} onClose={() => setNotice("")} />
      <OperationFeedback message={operationError} kind="error" onClose={() => setOperationError("")} />
      {statusDraft && <ConfirmationDialog title="Đổi trạng thái làm việc" busy={saving} onClose={() => { if (!writeLock.current) setStatusDraft(null); }} onConfirm={() => void confirmStatus()}>
        <p>Nhân viên: <strong>{statusDraft.name}</strong></p>
        <p>Trạng thái mới: {employmentLabels[statusDraft.status]}</p>
        <p>Lý do: {statusDraft.reason}</p>
      </ConfirmationDialog>}
      {dialog && (
        <Drawer
          title={
            dialog.mode === "create"
              ? "Tạo hồ sơ nhân viên"
              : dialog.mode === "view"
                ? "Chi tiết hồ sơ nhân viên"
                : dialog.mode === "status"
                  ? "Thay đổi trạng thái nhân viên"
                  : "Cập nhật hồ sơ nhân viên"
          }
          onClose={close}
          busy={saving}
        >
          {needsDetail && detail.loading ? (
            <p role="status">Đang tải hồ sơ...</p>
          ) : needsDetail && detail.error ? (
            <ApiFeedback error={detail.error} onRetry={detail.reload} />
          ) : (
            <form
              noValidate
              onSubmit={save}
              onInputCapture={(event) => {
                const name = (event.target as HTMLInputElement).name;
                if (fieldErrors[name])
                  setFieldErrors(
                    validateForm(event.currentTarget, fieldLabels),
                  );
              }}
              className="space-y-4"
            >
              <ApiFeedback error={formError} />
              <fieldset
                disabled={saving || dialog.mode === "view"}
                className="space-y-4"
              >
                {dialog.mode === "status" ? (
                  <>
                    <p className="font-medium">
                      {item.fullName} · {item.employeeCode}
                    </p>
                    <FormField label="Trạng thái">
                      <select
                        name="employmentStatus"
                        className={inputClass}
                        defaultValue={item.employmentStatus}
                      >
                        {Object.entries(employmentLabels).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </FormField>
                    <FormField
                      label="Lý do thay đổi"
                      error={fieldErrors.reason}
                    >
                      <textarea
                        name="reason"
                        maxLength={2000}
                        required
                        className={inputClass + " h-24 py-2"}
                      />
                    </FormField>
                  </>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Mã nhân viên">
                      <input
                        readOnly
                        value={item.employeeCode}
                        placeholder="Tự động sinh"
                        className={inputClass}
                      />
                    </FormField>
                    {(
                      [
                        ["fullName", "Họ tên", "text", 200],
                        ["email", "Email", "email", 255],
                        ["phone", "Số điện thoại", "tel", 30],
                        ["dateOfBirth", "Ngày sinh", "date", undefined],
                        ["hireDate", "Ngày vào làm", "date", undefined],
                        ["address", "Địa chỉ", "text", 2000],
                      ] as const
                    ).map(([key, label, type, limit]) => (
                      <FormField
                        key={key}
                        label={label}
                        error={fieldErrors[key]}
                      >
                        <input
                          name={key}
                          type={type}
                          required={[
                            "fullName",
                            "email",
                            "phone",
                            "hireDate",
                          ].includes(key)}
                          maxLength={limit}
                          defaultValue={String(item[key] ?? "")}
                          className={inputClass}
                        />
                      </FormField>
                    ))}
                    <FormField label="Giới tính">
                      <select
                        name="gender"
                        defaultValue={item.gender || ""}
                        className={inputClass}
                      >
                        <option value="">Chưa cập nhật</option>
                        {Object.entries(genderLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    {dialog.mode === "view" && (
                      <>
                        <FormField label="Phòng ban">
                          <input
                            disabled
                            value={item.department?.name || "Chưa phân công"}
                            className={inputClass}
                          />
                        </FormField>
                        <FormField label="Chức vụ">
                          <input
                            disabled
                            value={item.position?.name || "-"}
                            className={inputClass}
                          />
                        </FormField>
                        <FormField label="Quản lý trực tiếp">
                          <input
                            disabled
                            value={item.manager?.fullName || "-"}
                            className={inputClass}
                          />
                        </FormField>
                        <StatusBadge
                          label={employmentLabels[item.employmentStatus]}
                        />
                      </>
                    )}
                  </div>
                )}
              </fieldset>
              {allowed && dialog.mode === "view" && <button type="button" onClick={() => router.push(`/assignments?employeeId=${item.id}`)} className="h-10 rounded-md border border-border px-4 text-sm">Phân công nhân viên</button>}
            <FormActions
                onClose={close}
                readOnly={dialog.mode === "view"}
                busy={saving}
              />
            </form>
          )}
        </Drawer>
      )}
    </HrmAppShell>
  );
}
