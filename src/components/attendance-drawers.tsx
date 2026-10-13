"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { History, Pencil } from "lucide-react";
import { ApiError } from "@/lib/api";
import { ApiFeedback } from "@/components/api-feedback";
import {
  Drawer,
  FormActions,
  FormField,
  TableFooter,
  inputClass,
} from "@/components/hrm-ui";
import { focusFirstError, type FormErrors } from "@/lib/form-validation";
import { formatDate } from "@/lib/hrm-format";
import { useApiResource } from "@/lib/use-api-resource";
import {
  attendanceDate,
  attendanceDateTime,
  attendanceDuration,
  attendanceError,
  attendanceLabels,
  attendanceTime,
  fetchAttendance,
  fetchAttendanceHistory,
  saveAttendance,
  validateAttendance,
  type AttendanceMutation,
  type AttendanceRecord,
  type AttendanceStatus,
  type AttendanceValues,
} from "@/lib/attendances";
import type { EmployeeReference } from "@/lib/hrm-api";

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const tone =
    status === "PRESENT"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : ["LATE", "INCOMPLETE"].includes(status)
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : status === "ABSENT"
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium ${tone}`}
    >
      {attendanceLabels[status] ?? status}
    </span>
  );
}

export function AttendanceEditor({
  record,
  employees,
  fullDirectory,
  onClose,
  onSaved,
}: {
  record?: AttendanceRecord;
  employees: EmployeeReference[];
  fullDirectory: boolean;
  onClose: () => void;
  onSaved: (record: AttendanceMutation) => void;
}) {
  const detailLoader = useCallback(
    (signal: AbortSignal) => fetchAttendance(record?.id ?? 0, signal),
    [record?.id],
  );
  const detail = useApiResource(detailLoader, !!record);
  const [busy, setBusy] = useState(false);
  return (
    <Drawer
      title={record ? "Điều chỉnh bảng công" : "Bổ sung bảng công"}
      busy={busy}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {record && detail.loading ? (
        <p role="status">Đang tải bản ghi công...</p>
      ) : record && detail.error ? (
        <ApiFeedback error={detail.error} onRetry={detail.reload} />
      ) : (
        <AttendanceForm
          initial={detail.data ?? record}
          employees={employees}
          fullDirectory={fullDirectory}
          onClose={onClose}
          onSaved={onSaved}
          onBusy={setBusy}
        />
      )}
    </Drawer>
  );
}

function AttendanceForm({
  initial,
  employees,
  fullDirectory,
  onClose,
  onSaved,
  onBusy,
}: {
  initial?: AttendanceRecord;
  employees: EmployeeReference[];
  fullDirectory: boolean;
  onClose: () => void;
  onSaved: (record: AttendanceMutation) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [values, setValues] = useState<AttendanceValues>(() => ({
    employeeId: initial ? String(initial.employeeId) : "",
    workDate: initial?.workDate ?? attendanceDate(),
    checkInTime: attendanceTime(initial?.checkInAt),
    checkOutTime: attendanceTime(initial?.checkOutAt),
    attendanceStatus: initial?.attendanceStatus ?? "PRESENT",
    reason: "",
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const change = (field: keyof AttendanceValues, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: "" }));
    setError("");
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const submitted: AttendanceValues = {
      employeeId: initial
        ? String(initial.employeeId)
        : String(data.get("employeeId") ?? ""),
      workDate: String(data.get("workDate") ?? ""),
      checkInTime: String(data.get("checkInTime") ?? ""),
      checkOutTime: String(data.get("checkOutTime") ?? ""),
      attendanceStatus: String(
        data.get("attendanceStatus") ?? "",
      ) as AttendanceStatus,
      reason: String(data.get("reason") ?? ""),
    };
    setValues(submitted);
    const validation = validateAttendance(submitted);
    setErrors(validation);
    if (Object.keys(validation).length)
      focusFirstError(event.currentTarget, validation);
    else setConfirming(true);
  };
  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    try {
      const saved = await saveAttendance(values, initial?.id);
      onSaved(saved);
    } catch (failure) {
      setError(attendanceError(failure));
      if (failure instanceof ApiError) {
        const payload = failure.payload as {
          errors?: { field: string; message: string }[];
        };
        const names: Record<string, keyof AttendanceValues> = {
          checkInAt: "checkInTime",
          checkOutAt: "checkOutTime",
          employeeId: "employeeId",
          workDate: "workDate",
          reason: "reason",
          attendanceStatus: "attendanceStatus",
        };
        if (payload?.errors?.length) {
          const next: FormErrors = {};
          for (const item of payload.errors) {
            const field = names[item.field];
            if (field)
              next[field] = /^(must|size|not|invalid)/i.test(item.message)
                ? "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại."
                : item.message;
          }
          setErrors(next);
          setConfirming(false);
        }
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
      onBusy(false);
    }
  }
  const employee =
    initial?.employeeName ||
    employees.find((item) => String(item.id) === values.employeeId)?.fullName ||
    `ID ${values.employeeId}`;
  return (
    <div className="space-y-4">
      <ApiFeedback error={error} />
      {confirming ? (
        <>
          <h3 className="font-semibold">
            Xác nhận {initial ? "điều chỉnh" : "bổ sung"} công
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm [&_dt]:text-muted-foreground [&_dd]:break-words">
            <dt>Nhân viên</dt>
            <dd>{employee}</dd>
            <dt>Ngày công</dt>
            <dd>{formatDate(values.workDate)}</dd>
            <dt>Giờ vào</dt>
            <dd>
              {initial && (
                <span className="mr-2 text-muted-foreground">
                  {attendanceTime(initial.checkInAt) || "-"} →
                </span>
              )}
              {values.checkInTime || "-"}
            </dd>
            <dt>Giờ ra</dt>
            <dd>
              {initial && (
                <span className="mr-2 text-muted-foreground">
                  {attendanceTime(initial.checkOutAt) || "-"} →
                </span>
              )}
              {values.checkOutTime || "-"}
            </dd>
            <dt>Trạng thái</dt>
            <dd>
              {initial && (
                <span className="mr-2 text-muted-foreground">
                  {attendanceLabels[initial.attendanceStatus]} →
                </span>
              )}
              {attendanceLabels[values.attendanceStatus]}
            </dd>
            <dt>Lý do</dt>
            <dd className="whitespace-pre-wrap">{values.reason.trim()}</dd>
          </dl>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirming(false)}
              className="h-10 rounded-md border border-border px-4 text-sm"
            >
              Quay lại
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="h-10 rounded-md border border-border px-4 text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={confirm}
              className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Xác nhận lưu"}
            </button>
          </div>
        </>
      ) : (
        <form ref={formRef} noValidate onSubmit={submit} className="space-y-4">
          <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField
                label={fullDirectory || initial ? "Nhân viên" : "ID nhân viên"}
                error={errors.employeeId}
              >
                {initial ? (
                  <input
                    className={inputClass}
                    value={`${initial.employeeCode} - ${initial.employeeName}`}
                    readOnly
                  />
                ) : fullDirectory ? (
                  <select
                    name="employeeId"
                    className={inputClass}
                    value={values.employeeId}
                    onChange={(event) =>
                      change("employeeId", event.target.value)
                    }
                  >
                    <option value="">Chọn nhân viên</option>
                    {employees.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.employeeCode} - {item.fullName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name="employeeId"
                    type="number"
                    min="1"
                    step="1"
                    list="attendance-employees"
                    className={inputClass}
                    value={values.employeeId}
                    onChange={(event) =>
                      change("employeeId", event.target.value)
                    }
                  />
                )}
              </FormField>
              <datalist id="attendance-employees">
                {employees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.employeeCode} - {item.fullName}
                  </option>
                ))}
              </datalist>
            </div>
            <FormField label="Ngày công" error={errors.workDate}>
              <input
                name="workDate"
                type="date"
                className={inputClass}
                value={values.workDate}
                readOnly={!!initial}
                onInput={(event) =>
                  change("workDate", event.currentTarget.value)
                }
                onChange={(event) => change("workDate", event.target.value)}
              />
            </FormField>
            <FormField label="Trạng thái công" error={errors.attendanceStatus}>
              <select
                name="attendanceStatus"
                className={inputClass}
                value={values.attendanceStatus}
                onChange={(event) =>
                  change("attendanceStatus", event.target.value)
                }
              >
                {Object.entries(attendanceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Giờ vào" error={errors.checkInTime}>
              <input
                name="checkInTime"
                type="time"
                step="1"
                className={inputClass}
                value={values.checkInTime}
                onInput={(event) =>
                  change("checkInTime", event.currentTarget.value)
                }
                onChange={(event) => change("checkInTime", event.target.value)}
              />
            </FormField>
            <FormField label="Giờ ra" error={errors.checkOutTime}>
              <input
                name="checkOutTime"
                type="time"
                step="1"
                className={inputClass}
                value={values.checkOutTime}
                onInput={(event) =>
                  change("checkOutTime", event.currentTarget.value)
                }
                onChange={(event) => change("checkOutTime", event.target.value)}
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField
                label="Lý do bổ sung / điều chỉnh"
                error={errors.reason}
              >
                <textarea
                  name="reason"
                  maxLength={1000}
                  rows={4}
                  className={inputClass + " h-auto py-2"}
                  value={values.reason}
                  onChange={(event) => change("reason", event.target.value)}
                />
              </FormField>
            </div>
          </fieldset>
          <FormActions
            onClose={onClose}
            primaryLabel="Tiếp tục"
            busy={saving}
          />
        </form>
      )}
    </div>
  );
}

export function AttendanceViewer({
  id,
  showHistory = false,
  onClose,
  onEdit,
}: {
  id: number;
  showHistory?: boolean;
  onClose: () => void;
  onEdit: (record: AttendanceRecord) => void;
}) {
  const [tab, setTab] = useState(showHistory ? "history" : "detail");
  const [page, setPage] = useState(1);
  const load = useCallback(
    (signal: AbortSignal) => fetchAttendance(id, signal),
    [id],
  );
  const detail = useApiResource(load);
  const historyLoader = useCallback(
    (signal: AbortSignal) => fetchAttendanceHistory(id, page - 1, signal),
    [id, page],
  );
  const history = useApiResource(
    historyLoader,
    tab === "history" && !!detail.data,
  );
  const item = detail.data;
  return (
    <Drawer title="Chi tiết bảng công" onClose={onClose}>
      {detail.loading ? (
        <p role="status">Đang tải bản ghi công...</p>
      ) : detail.error ? (
        <ApiFeedback error={detail.error} onRetry={detail.reload} />
      ) : (
        item && (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">{item.employeeName}</p>
                <p className="text-sm text-muted-foreground">
                  {item.employeeCode} · {formatDate(item.workDate)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Điều chỉnh công"
                title="Điều chỉnh công"
                onClick={() => onEdit(item)}
                className="grid size-9 shrink-0 place-items-center rounded-md border border-border hover:bg-muted"
              >
                <Pencil className="size-4" />
              </button>
            </div>
            <div
              role="tablist"
              aria-label="Thông tin bảng công"
              className="mb-5 flex gap-1 border-b border-border"
            >
              {[
                { value: "detail", label: "Chi tiết" },
                { value: "history", label: "Lịch sử điều chỉnh" },
              ].map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  id={`attendance-tab-${entry.value}`}
                  role="tab"
                  aria-selected={tab === entry.value}
                  aria-controls={`attendance-panel-${entry.value}`}
                  onClick={() => setTab(entry.value)}
                  className={`flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm ${tab === entry.value ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground"}`}
                >
                  {entry.value === "history" && <History className="size-4" />}
                  {entry.label}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`attendance-panel-${tab}`}
              aria-labelledby={`attendance-tab-${tab}`}
            >
              {tab === "detail" ? (
                <dl className="grid grid-cols-2 gap-4 text-sm [&_dt]:mb-1 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:break-words">
                  <div>
                    <dt>Phòng ban tại ngày công</dt>
                    <dd>{item.department?.name || "Chưa phân công"}</dd>
                  </div>
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>
                      <AttendanceBadge status={item.attendanceStatus} />
                    </dd>
                  </div>
                  <div>
                    <dt>Giờ vào</dt>
                    <dd>{attendanceTime(item.checkInAt) || "-"}</dd>
                  </div>
                  <div>
                    <dt>Giờ ra</dt>
                    <dd>{attendanceTime(item.checkOutAt) || "-"}</dd>
                  </div>
                  <div>
                    <dt>Thời gian làm</dt>
                    <dd>{attendanceDuration(item.workingMinutes)}</dd>
                  </div>
                  <div>
                    <dt>Nguồn cập nhật</dt>
                    <dd>
                      {item.manuallyAdjusted
                        ? "Điều chỉnh thủ công"
                        : "Chấm công trên ứng dụng"}
                    </dd>
                  </div>
                  <div>
                    <dt>Wi-Fi khi vào</dt>
                    <dd>{item.checkInWifiSsid || "-"}</dd>
                  </div>
                  <div>
                    <dt>Wi-Fi khi ra</dt>
                    <dd>{item.checkOutWifiSsid || "-"}</dd>
                  </div>
                  <div>
                    <dt>Vị trí khi vào</dt>
                    <dd>
                      {item.checkInLatitude != null &&
                      item.checkInLongitude != null
                        ? `${item.checkInLatitude}, ${item.checkInLongitude}`
                        : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt>Vị trí khi ra</dt>
                    <dd>
                      {item.checkOutLatitude != null &&
                      item.checkOutLongitude != null
                        ? `${item.checkOutLatitude}, ${item.checkOutLongitude}`
                        : "-"}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt>Lý do điều chỉnh gần nhất</dt>
                    <dd className="whitespace-pre-wrap">
                      {item.adjustmentReason || "-"}
                    </dd>
                  </div>
                  <div>
                    <dt>Ngày tạo</dt>
                    <dd>{attendanceDateTime(item.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Cập nhật gần nhất</dt>
                    <dd>{attendanceDateTime(item.updatedAt)}</dd>
                  </div>
                </dl>
              ) : (
                <>
                  <ApiFeedback error={history.error} onRetry={history.reload} />
                  {history.loading ? (
                    <p role="status">Đang tải lịch sử...</p>
                  ) : !history.error && !history.data?.content.length ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Chưa có lịch sử điều chỉnh.
                    </p>
                  ) : (
                    <ol className="divide-y divide-border">
                      {history.data?.content.map((entry) => (
                        <li
                          key={entry.id}
                          className="space-y-3 py-4 first:pt-0"
                        >
                          <div className="flex flex-wrap justify-between gap-2 text-xs">
                            <span className="font-semibold">
                              {entry.adjustedByUsername}
                            </span>
                            <time
                              className="text-muted-foreground"
                              dateTime={entry.adjustedAt}
                            >
                              {attendanceDateTime(entry.adjustedAt)}
                            </time>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            {[
                              {
                                label: "Trước",
                                checkInAt: entry.previousCheckInAt,
                                checkOutAt: entry.previousCheckOutAt,
                                minutes: entry.previousWorkingMinutes,
                                status: entry.previousAttendanceStatus,
                              },
                              {
                                label: "Sau",
                                checkInAt: entry.newCheckInAt,
                                checkOutAt: entry.newCheckOutAt,
                                minutes: entry.newWorkingMinutes,
                                status: entry.newAttendanceStatus,
                              },
                            ].map((state) => (
                              <div
                                key={state.label}
                                className="min-w-0 space-y-1"
                              >
                                <p className="font-semibold text-muted-foreground">
                                  {state.label}
                                </p>
                                <p>
                                  {attendanceTime(state.checkInAt) || "-"} →{" "}
                                  {attendanceTime(state.checkOutAt) || "-"}
                                </p>
                                <p>{attendanceDuration(state.minutes)}</p>
                                <p>
                                  {state.status
                                    ? attendanceLabels[state.status]
                                    : "Chưa có bản ghi"}
                                </p>
                              </div>
                            ))}
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {entry.reason}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                  {!!history.data && (
                    <TableFooter
                      total={history.data.totalElements}
                      page={page}
                      pageSize={8}
                      onPage={setPage}
                    />
                  )}
                </>
              )}
            </div>
            <FormActions onClose={onClose} readOnly />
          </>
        )
      )}
    </Drawer>
  );
}
