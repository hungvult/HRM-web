"use client";

import { useCallback, useState } from "react";
import { ArrowDownWideNarrow, History } from "lucide-react";
import HrmAppShell from "@/components/hrm-app-shell";
import { ApiFeedback, LoadingRow } from "@/components/api-feedback";
import {
  EmptyRow,
  FilterBar,
  FormField,
  ListCard,
  RowActions,
  TableFooter,
  inputClass,
  tableClass,
} from "@/components/hrm-ui";
import {
  AttendanceBadge,
  AttendanceEditor,
  AttendanceViewer,
} from "@/components/attendance-drawers";
import {
  canManageHrm,
  fetchAll,
  fetchMyProfile,
  type CatalogRecord,
  type EmployeeRecord,
  type EmployeeReference,
} from "@/lib/hrm-api";
import {
  attendanceDate,
  attendanceDuration,
  attendanceLabels,
  attendanceTime,
  canManageAttendance,
  fetchAttendances,
  type AttendanceMutation,
  type AttendanceRecord,
} from "@/lib/attendances";
import { formatDate } from "@/lib/hrm-format";
import { useApiResource } from "@/lib/use-api-resource";

type Dialog =
  | { mode: "create" }
  | { mode: "edit"; record: AttendanceRecord }
  | { mode: "view"; id: number; history: boolean };
async function loadDirectory(signal: AbortSignal) {
  const employees = await fetchAll<EmployeeRecord>("/employees", {}, signal);
  const departments = await fetchAll<CatalogRecord>("/departments", {}, signal);
  return { employees, departments };
}

export default function AttendanceManagementPage() {
  const session = useApiResource(fetchMyProfile);
  const allowed = canManageAttendance(session.data);
  const fullDirectory = canManageHrm(session.data);
  const directory = useApiResource(loadDirectory, fullDirectory);
  const [query, setQuery] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");
  const [dates, setDates] = useState(() => {
    const today = attendanceDate();
    return { fromDate: today.slice(0, 7) + "-01", toDate: today };
  });
  const [sort, setSort] = useState("workDate:desc");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState("");
  const dateError =
    dates.fromDate && dates.toDate && dates.fromDate > dates.toDate
      ? "Từ ngày không được sau đến ngày."
      : "";
  const load = useCallback(
    (signal: AbortSignal) => {
      const [sortBy, sortDirection] = sort.split(":");
      return fetchAttendances(
        {
          q: query,
          employeeId,
          departmentId,
          status,
          ...dates,
          sortBy,
          sortDirection,
          page: page - 1,
          size,
        },
        signal,
      );
    },
    [query, employeeId, departmentId, status, dates, sort, page, size],
  );
  const records = useApiResource(load, allowed && !dateError);
  const rows = records.data?.content ?? [];
  const scopeEmployees: EmployeeReference[] = Array.from(
    new Map(
      rows.map((item) => [
        item.employeeId,
        {
          id: item.employeeId,
          employeeCode: item.employeeCode,
          fullName: item.employeeName,
        },
      ]),
    ).values(),
  );
  const employees = directory.data?.employees ?? scopeEmployees;
  const departments =
    directory.data?.departments ??
    Array.from(
      new Map(
        rows
          .filter((item) => item.department)
          .map((item) => [item.department!.id, item.department!]),
      ).values(),
    );
  const error =
    session.error ||
    (session.data && !allowed
      ? "Bạn không có quyền quản lý bảng công."
      : dateError || records.error);
  const loading = session.loading || (allowed && records.loading);
  function reload() {
    session.reload();
    records.reload();
    directory.reload();
  }
  function resetFilters() {
    setQuery("");
    setDepartmentId("");
    setEmployeeId("");
    setStatus("");
    setDates({ fromDate: "", toDate: "" });
    setSort("workDate:desc");
    setPage(1);
  }
  function saved(record: AttendanceMutation) {
    setPage(1);
    records.reload();
    setNotice("Đã lưu bảng công và lịch sử điều chỉnh.");
    setDialog({ mode: "view", id: record.id, history: true });
  }
  return (
    <HrmAppShell
      user={session.data}
      activeLabel="Bảng công"
      title="Quản lý bảng công"
      description="Ngày công và lịch sử điều chỉnh"
      actionLabel={allowed ? "Bổ sung công" : undefined}
      actionDisabled={session.loading || (fullDirectory && directory.loading)}
      onAction={() => {
        setNotice("");
        setDialog({ mode: "create" });
      }}
    >
      <ApiFeedback error={error} onRetry={dateError ? undefined : reload} />
      {session.loading && (
        <p
          role="status"
          className="py-6 text-center text-sm text-muted-foreground"
        >
          Đang tải thông tin người dùng...
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {allowed && (
        <ListCard
          title="Danh sách bảng công"
          description={`${records.data?.totalElements ?? 0} bản ghi`}
          actions={
            <FilterBar
              query={query}
              placeholder="Mã hoặc tên nhân viên"
              onQuery={(value) => {
                setQuery(value);
                setPage(1);
              }}
              onReload={reload}
              filters={[
                {
                  label: "Mọi phòng ban",
                  value: departmentId,
                  options: departments.map((item) => ({
                    value: String(item.id),
                    label: item.name,
                  })),
                  onChange: (value) => {
                    setDepartmentId(value);
                    setPage(1);
                  },
                },
                {
                  label: "Mọi trạng thái",
                  value: status,
                  options: Object.entries(attendanceLabels).map(
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
              total={records.data?.totalElements ?? 0}
              page={page}
              pageSize={size}
              onPage={setPage}
            />
          }
        >
          <div className="grid items-end gap-3 border-b border-border px-4 py-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr_1.3fr_auto]">
            <FormField label="Từ ngày">
              <input
                type="date"
                className={inputClass}
                value={dates.fromDate}
                onInput={(event) => {
                  setDates({ ...dates, fromDate: event.currentTarget.value });
                  setPage(1);
                }}
                onChange={(event) => {
                  setDates({ ...dates, fromDate: event.target.value });
                  setPage(1);
                }}
              />
            </FormField>
            <FormField label="Đến ngày">
              <input
                type="date"
                className={inputClass}
                value={dates.toDate}
                onInput={(event) => {
                  setDates({ ...dates, toDate: event.currentTarget.value });
                  setPage(1);
                }}
                onChange={(event) => {
                  setDates({ ...dates, toDate: event.target.value });
                  setPage(1);
                }}
              />
            </FormField>
            <FormField label={fullDirectory ? "Nhân viên" : "ID nhân viên"}>
              {fullDirectory ? (
                <select
                  className={inputClass}
                  value={employeeId}
                  onChange={(event) => {
                    setEmployeeId(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Tất cả nhân viên</option>
                  {employees.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.employeeCode} - {item.fullName}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min="1"
                  step="1"
                  className={inputClass}
                  value={employeeId}
                  onChange={(event) => {
                    setEmployeeId(event.target.value);
                    setPage(1);
                  }}
                />
              )}
            </FormField>
            <FormField label="Sắp xếp">
              <select
                className={inputClass}
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(1);
                }}
              >
                <option value="workDate:desc">Ngày công mới nhất</option>
                <option value="workDate:asc">Ngày công cũ nhất</option>
                <option value="workingMinutes:desc">
                  Thời gian làm giảm dần
                </option>
                <option value="workingMinutes:asc">
                  Thời gian làm tăng dần
                </option>
                <option value="checkInAt:asc">Giờ vào tăng dần</option>
              </select>
            </FormField>
            <button
              type="button"
              onClick={resetFilters}
              className="flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              <ArrowDownWideNarrow className="size-4" />
              Xóa bộ lọc
            </button>
          </div>
          <ApiFeedback error={directory.error} onRetry={directory.reload} />
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr className="border-b border-border bg-muted/55 text-[0.68rem] uppercase text-muted-foreground">
                  {[
                    "Nhân viên",
                    "Phòng ban",
                    "Ngày công",
                    "Giờ vào / ra",
                    "Thời gian làm",
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
                  <LoadingRow columns={7} />
                ) : (
                  !error &&
                  rows.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <p className="font-semibold">{item.employeeName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.employeeCode}
                        </p>
                      </td>
                      <td>{item.department?.name || "Chưa phân công"}</td>
                      <td className="whitespace-nowrap">
                        {formatDate(item.workDate)}
                      </td>
                      <td className="whitespace-nowrap">
                        <p>{attendanceTime(item.checkInAt) || "-"}</p>
                        <p className="text-muted-foreground">
                          {attendanceTime(item.checkOutAt) || "-"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap">
                        {attendanceDuration(item.workingMinutes)}
                      </td>
                      <td>
                        <AttendanceBadge status={item.attendanceStatus} />
                        {item.manuallyAdjusted && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Đã điều chỉnh
                          </p>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <RowActions
                            name={item.employeeCode}
                            onView={() =>
                              setDialog({
                                mode: "view",
                                id: item.id,
                                history: false,
                              })
                            }
                            onEdit={() =>
                              setDialog({ mode: "edit", record: item })
                            }
                          />
                          <button
                            type="button"
                            title="Lịch sử điều chỉnh"
                            aria-label={`Lịch sử điều chỉnh ${item.employeeCode}`}
                            onClick={() =>
                              setDialog({
                                mode: "view",
                                id: item.id,
                                history: true,
                              })
                            }
                            className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                          >
                            <History className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                {!loading && !error && !rows.length && <EmptyRow columns={7} />}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end border-t border-border px-4 py-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Số bản ghi mỗi trang
              <select
                aria-label="Số bản ghi mỗi trang"
                className={inputClass + " w-20"}
                value={size}
                onChange={(event) => {
                  setSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value={8}>8</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
        </ListCard>
      )}
      {allowed && dialog?.mode === "view" && (
        <AttendanceViewer
          key={`${dialog.id}:${dialog.history}`}
          id={dialog.id}
          showHistory={dialog.history}
          onClose={() => setDialog(null)}
          onEdit={(record) => setDialog({ mode: "edit", record })}
        />
      )}
      {allowed && (dialog?.mode === "create" || dialog?.mode === "edit") && (
        <AttendanceEditor
          record={dialog.mode === "edit" ? dialog.record : undefined}
          employees={employees}
          fullDirectory={fullDirectory}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      )}
    </HrmAppShell>
  );
}
