import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

class ApiError extends Error {
  constructor(status, payload) {
    super("API error");
    this.status = status;
    this.payload = payload;
  }
}
const source = ts.transpileModule(
  readFileSync(new URL("../src/lib/attendances.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function client(request = async () => ({}), page = request) {
  const sandbox = {
    exports: {},
    Intl,
    Date,
    require: (name) =>
      name.endsWith("hrm-api")
        ? { fetchPage: page }
        : { ApiError, apiRequest: request },
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const valid = () => ({
  employeeId: "2",
  workDate: "2026-10-13",
  checkInTime: "08:15",
  checkOutTime: "17:30",
  attendanceStatus: "PRESENT",
  reason: " Bổ sung công bị thiếu ",
});

test("attendance management is available only to ADMIN/HR/MANAGER", () => {
  const api = client();
  for (const role of ["ADMIN", "HR", "MANAGER"])
    assert.equal(api.canManageAttendance({ roles: [role] }), true);
  assert.equal(api.canManageAttendance({ roles: ["EMPLOYEE"] }), false);
  assert.equal(api.canManageAttendance(null), false);
});
test("list keeps backend filtering and zero-based pagination", async () => {
  const params = {
    q: "Nguyễn",
    employeeId: 2,
    departmentId: 1,
    status: "INCOMPLETE",
    fromDate: "2026-10-01",
    toDate: "2026-10-13",
    sortBy: "workDate",
    sortDirection: "desc",
    page: 0,
    size: 20,
  };
  const controller = new AbortController();
  const api = client(undefined, async (path, actual, signal) => {
    assert.equal(path, "/attendances");
    assert.deepEqual(plain(actual), params);
    assert.equal(signal, controller.signal);
  });
  await api.fetchAttendances(params, controller.signal);
});
test("detail and history use supported endpoints with cancellation and pagination", async () => {
  const signal = new AbortController().signal;
  const api = client(
    async (path, options) => {
      assert.equal(path, "/attendances/7");
      assert.equal(options.signal, signal);
    },
    async (path, query, actualSignal) => {
      assert.equal(path, "/attendances/7/history");
      assert.deepEqual(plain(query), { page: 1, size: 8 });
      assert.equal(actualSignal, signal);
    },
  );
  await api.fetchAttendance(7, signal);
  await api.fetchAttendanceHistory(7, 1, signal);
});
test("create sends only writable fields in company time zone and trims reason", async () => {
  const api = client(async (path, options) => {
    assert.equal(path, "/attendances");
    assert.equal(options.method, "POST");
    assert.deepEqual(plain(options.body), {
      employeeId: 2,
      workDate: "2026-10-13",
      checkInAt: "2026-10-13T08:15:00+07:00",
      checkOutAt: "2026-10-13T17:30:00+07:00",
      attendanceStatus: "PRESENT",
      reason: "Bổ sung công bị thiếu",
    });
    assert.equal("workingMinutes" in options.body, false);
  });
  await api.saveAttendance({ ...valid(), workingMinutes: 9999, latitude: 10 });
});
test("adjust uses PATCH, excludes immutable employee/date and preserves seconds", async () => {
  const api = client(async (path, options) => {
    assert.equal(path, "/attendances/7");
    assert.equal(options.method, "PATCH");
    assert.equal(options.body.checkInAt, "2026-10-13T08:15:20+07:00");
    assert.equal("employeeId" in options.body, false);
    assert.equal("workDate" in options.body, false);
  });
  await api.saveAttendance({ ...valid(), checkInTime: "08:15:20" }, 7);
});
test("empty times are explicit nulls so adjustment can clear old values", () => {
  assert.equal(
    client().attendanceBody(
      {
        ...valid(),
        checkInTime: "",
        checkOutTime: "",
        attendanceStatus: "ABSENT",
      },
      false,
    ).checkInAt,
    null,
  );
});
test("valid full record and incomplete record pass validation", () => {
  const api = client();
  assert.deepEqual(plain(api.validateAttendance(valid())), {});
  assert.deepEqual(
    plain(
      api.validateAttendance({
        ...valid(),
        checkOutTime: "",
        attendanceStatus: "INCOMPLETE",
      }),
    ),
    {},
  );
});
for (const employeeId of ["", "0", "-1", "2.5", "abc", "9007199254740992"]) {
  test("invalid employee ID " + employeeId + " is rejected", () =>
    assert.ok(
      client().validateAttendance({ ...valid(), employeeId }).employeeId,
    ),
  );
}
for (const workDate of ["", "2026-02-30", "2026-13-01", "2026-1-1"]) {
  test("invalid work date " + workDate + " is rejected", () =>
    assert.ok(client().validateAttendance({ ...valid(), workDate }).workDate),
  );
}
test("backwards time and invalid clock values report Vietnamese errors", () => {
  const api = client();
  assert.equal(
    api.validateAttendance({ ...valid(), checkOutTime: "08:00" }).checkOutTime,
    "Giờ ra không được trước giờ vào.",
  );
  assert.ok(
    api.validateAttendance({ ...valid(), checkInTime: "25:00" }).checkInTime,
  );
});
test("one timestamp requires INCOMPLETE but two absent timestamps are allowed", () => {
  const api = client();
  assert.ok(
    api.validateAttendance({ ...valid(), checkOutTime: "" }).attendanceStatus,
  );
  assert.deepEqual(
    plain(
      api.validateAttendance({
        ...valid(),
        checkInTime: "",
        checkOutTime: "",
        attendanceStatus: "LEAVE",
      }),
    ),
    {},
  );
});
test("reason is mandatory and limited to 1000 characters", () => {
  const api = client();
  assert.ok(api.validateAttendance({ ...valid(), reason: "   " }).reason);
  assert.ok(
    api.validateAttendance({ ...valid(), reason: "a".repeat(1001) }).reason,
  );
});

test("unknown or inherited status names cannot pass validation", () => {
  for (const attendanceStatus of ["UNKNOWN", "constructor", "toString"])
    assert.ok(client().validateAttendance({ ...valid(), attendanceStatus }).attendanceStatus);
});
test("UTC response is displayed and edited in company zone, not machine zone", () => {
  const api = client();
  assert.equal(api.attendanceTime("2026-10-13T01:15:20Z"), "08:15:20");
  assert.equal(api.attendanceTime("2026-10-12T17:00:00Z"), "00:00:00");
  assert.equal(
    api.attendanceDate(new Date("2026-10-12T17:00:00Z")),
    "2026-10-13",
  );
  assert.equal(api.attendanceTime(null), "");
  assert.equal(api.attendanceDuration(0), "0 giờ 0 phút");
});
test("duplicate, forbidden scope and generic server errors have Vietnamese messages", () => {
  const api = client();
  assert.match(
    api.attendanceError(
      new ApiError(409, { code: "ATTENDANCE_ALREADY_EXISTS" }),
    ),
    /đã có bản ghi/,
  );
  assert.match(
    api.attendanceError(new ApiError(403, { code: "AUTH_FORBIDDEN_SCOPE" })),
    /không có quyền/,
  );
  assert.doesNotMatch(
    api.attendanceError(
      new ApiError(500, { message: "An unexpected error occurred." }),
    ),
    /unexpected/,
  );
});

test("read failures show Vietnamese errors without replacing failed data with fixtures", async () => {
  const api = client(undefined, async () => {
    throw new ApiError(500, { message: "An unexpected error occurred." });
  });
  await assert.rejects(
    api.fetchAttendances({}),
    /Không thể tải bảng công từ máy chủ/,
  );
});

function renderPage(
  role,
  { rows = [], error = "", loading = false, total = rows.length } = {},
) {
  const require = createRequire(import.meta.url);
  const cache = new Map();
  const enabledRequests = [];
  let resourceCall = 0;
  const stub = {
    data: null,
    error: "",
    loading: false,
    reload() {},
    replace() {},
  };
  const user = {
    id: 1,
    username: "qa",
    roles: [role],
    employee: { fullName: "Người dùng QA" },
  };
  function load(name) {
    if (name === "next/navigation") return { useRouter: () => ({ push() {} }) };
    if (name === "next/link")
      return {
        __esModule: true,
        default: ({ children, ...props }) =>
          React.createElement("a", props, children),
      };
    if (name === "@/lib/auth") return { logoutClientSide() {} };
    if (name === "@/lib/api") return { ApiError, apiRequest: async () => ({}) };
    if (name === "@/lib/use-api-resource")
      return {
        useApiResource(_loader, enabled = true) {
          const index = resourceCall++;
          enabledRequests.push(enabled);
          if (index === 0) return { ...stub, data: user };
          if (index === 1)
            return {
              ...stub,
              data: enabled ? { employees: [], departments: [] } : null,
            };
          return {
            ...stub,
            loading,
            error,
            data:
              enabled && !error
                ? { content: rows, totalElements: total }
                : null,
          };
        },
      };
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const path = "../src/" + name.slice(2);
    let file;
    try {
      file = readFileSync(new URL(path + ".tsx", import.meta.url), "utf8");
    } catch {
      file = readFileSync(new URL(path + ".ts", import.meta.url), "utf8");
    }
    const compiled = ts.transpileModule(file, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const exports = {};
    cache.set(name, exports);
    vm.runInNewContext(compiled, {
      exports,
      require: load,
      Intl,
      Date,
      URLSearchParams,
      process: { env: {} },
    });
    return exports;
  }
  const Page = load("@/app/attendances/page").default;
  return {
    html: renderToStaticMarkup(React.createElement(Page)),
    enabledRequests,
  };
}
const fixture = {
  id: 10,
  employeeId: 2,
  employeeCode: "QA002",
  employeeName: "Nhân viên QA",
  workDate: "2026-10-13",
  department: { id: 1, code: "QA", name: "Phòng QA" },
  checkInAt: "2026-10-13T01:15:00Z",
  checkOutAt: "2026-10-13T10:00:00Z",
  workingMinutes: 525,
  attendanceStatus: "PRESENT",
  manuallyAdjusted: true,
};
test("API list rows render employee, historic department, company time and actions", () => {
  const { html } = renderPage("ADMIN", { rows: [fixture], total: 21 });
  for (const text of [
    "Nhân viên QA",
    "QA002",
    "Phòng QA",
    "08:15:00",
    "17:00:00",
    "8 giờ 45 phút",
    "Đã điều chỉnh",
    "Xem chi tiết QA002",
    "Lịch sử điều chỉnh QA002",
    "Trang sau",
  ])
    assert.ok(html.includes(text), text);
  assert.match(html, /href="\/attendances"/);
});
test("manager gets attendance navigation but never requests the all-company employee directory", () => {
  const { html, enabledRequests } = renderPage("MANAGER", { rows: [fixture] });
  assert.match(html, /href="\/attendances"/);
  assert.doesNotMatch(html, /href="\/employees"/);
  assert.equal(enabledRequests[1], false);
  assert.equal(enabledRequests[2], true);
  assert.match(html, /ID nhân viên/);
});
test("employee is denied the page and has no attendance navigation or add action", () => {
  const { html, enabledRequests } = renderPage("EMPLOYEE");
  assert.match(html, /Bạn không có quyền quản lý bảng công/);
  assert.doesNotMatch(html, /href="\/attendances"/);
  assert.doesNotMatch(html, /Bổ sung công|Danh sách bảng công/);
  assert.equal(enabledRequests[2], false);
});
test("loading, empty and failed list states are distinct", () => {
  assert.match(renderPage("HR", { loading: true }).html, /Đang tải dữ liệu/);
  assert.match(renderPage("HR").html, /Không tìm thấy kết quả/);
  const { html } = renderPage("HR", {
    error: "Không thể tải bảng công từ máy chủ.",
  });
  assert.match(html, /Không thể tải bảng công từ máy chủ/);
  assert.doesNotMatch(html, /Không tìm thấy kết quả/);
});
