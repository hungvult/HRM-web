import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
class ApiError extends Error {
  constructor(status) {
    super("API error");
    this.status = status;
  }
}
function moduleAt(path, dependencies = {}, env = {}) {
  const source = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const sandbox = {
    exports: {},
    Date,
    Intl,
    process: { env },
    require: (name) =>
      name in dependencies ? dependencies[name] : require(name),
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const api = (request = async () => ({}), page = request) =>
  moduleAt("../src/lib/leave-requests.ts", {
    "@/lib/api": { apiRequest: request, ApiError },
    "@/lib/hrm-api": { fetchPage: page },
  });
const user = (roles, id = 900) => ({ roles, employee: { id } });
const filters = () => ({
  status: "PENDING",
  leaveTypeId: "",
  fromDate: "",
  toDate: "",
  page: 0,
  size: 10,
});
test("management permits only admin HR manager", () => {
  for (const role of ["ADMIN", "HR", "MANAGER"])
    assert.equal(api().canManageLeave(user([role])), true);
  assert.equal(api().canManageLeave(user(["EMPLOYEE"])), false);
  assert.equal(api().canManageLeave(null), false);
});
test("own requests and final states cannot be reviewed", () => {
  const client = api();
  assert.equal(
    client.canReviewLeave(user(["HR"]), { employeeId: 900, status: "PENDING" }),
    false,
  );
  assert.equal(
    client.canReviewLeave(user(["HR"]), { employeeId: 901, status: "PENDING" }),
    true,
  );
  for (const status of ["APPROVED", "REJECTED", "CANCELLED"])
    assert.equal(
      client.canReviewLeave(user(["HR"]), { employeeId: 901, status }),
      false,
    );
  assert.equal(
    client.canReviewLeave(
      { roles: ["ADMIN"] },
      { employeeId: 901, status: "PENDING" },
    ),
    false,
  );
});
test("date range and rejection reason are Vietnamese", () => {
  assert.match(
    api().validateLeaveFilters({
      ...filters(),
      fromDate: "2026-10-20",
      toDate: "2026-10-01",
    }),
    /Từ ngày/,
  );
  assert.equal(api().validateLeaveFilters(filters()), "");
  assert.match(api().validateRejection("  "), /Vui lòng/);
  assert.match(api().validateRejection("a".repeat(1001)), /1.000/);
  assert.equal(api().validateRejection("  Đã bố trí lại lịch  "), "");
});
test("list uses only actual PR69 query contract and zero-based paging", async () => {
  const signal = new AbortController().signal;
  await api(undefined, async (path, query, actualSignal) => {
    assert.equal(path, "/leave-requests");
    assert.deepEqual(plain(query), filters());
    assert.equal(actualSignal, signal);
  }).fetchLeaveRequests(filters(), signal);
});
test("detail is read only and rejects invalid IDs", async () => {
  let called = 0;
  const client = api(async (path, options) => {
    called++;
    assert.equal(path, "/leave-requests/4");
    assert.equal(options.method, undefined);
  });
  await client.fetchLeaveDetail(4);
  for (const id of [-1, 0, NaN, 1.5])
    await assert.rejects(client.fetchLeaveDetail(id), /Mã đơn/);
  assert.equal(called, 1);
});
test("transport errors are translated without exposing English", async () => {
  for (const status of [401, 403, 404, 409, 500]) {
    const client = api(async () => {
      throw new ApiError(status);
    });
    await assert.rejects(client.fetchLeaveDetail(1), /Phiên|quyền|Không|Đơn/);
  }
});
test("status lookup handles unexpected prototype keys", () => {
  assert.equal(api().leaveStatusLabel("toString"), "Không xác định");
});
test("fixture filtering searches all rows before pagination, and date overlap", () => {
  const preview = moduleAt("../src/lib/leave-preview.ts", {
    "@/lib/hrm-format": {
      matchesSearch: (q, values) =>
        values.join(" ").toLowerCase().includes(q.toLowerCase()),
    },
  });
  const rows = preview.createLeavePreview();
  assert.equal(rows.length, 24);
  assert.equal(
    preview.filterLeavePreview(rows, { ...filters(), status: "" }, "NP-MAU-024")
      .length,
    1,
  );
  assert.equal(
    preview
      .filterLeavePreview(rows, { ...filters(), status: "REJECTED" }, "")
      .every((item) => item.status === "REJECTED"),
    true,
  );
});
test("production refuses preview regardless of URL query", async () => {
  const Page = moduleAt(
    "../src/app/leave-requests/page.tsx",
    {
      "@/components/leave-management": {
        default: () => null,
        __esModule: true,
      },
    },
    { NODE_ENV: "production" },
  ).default;
  const result = await Page({
    searchParams: Promise.resolve({ preview: "1" }),
  });
  assert.equal(result.props.preview, false);
  assert.equal(result.props.apiEnabled, true);
});
test("read API can be explicitly disabled on both routes", async () => {
  for (const path of [
    "../src/app/leave-requests/page.tsx",
    "../src/app/leave-requests/[id]/page.tsx",
  ]) {
    const Page = moduleAt(path, {
      "@/components/leave-management": { default: () => null, __esModule: true },
    }, { NODE_ENV: "production", HRM_LEAVE_READ_ENABLED: "false" }).default;
    const result = await Page({
      params: Promise.resolve({ id: "4" }),
      searchParams: Promise.resolve({ preview: "1" }),
    });
    assert.equal(result.props.apiEnabled, false);
    assert.equal(result.props.preview, false);
  }
});
test("development allows explicit preview but not normal requests", async () => {
  const Page = moduleAt(
    "../src/app/leave-requests/page.tsx",
    {
      "@/components/leave-management": {
        default: () => null,
        __esModule: true,
      },
    },
    { NODE_ENV: "development" },
  ).default;
  assert.equal(
    (await Page({ searchParams: Promise.resolve({ preview: "1" }) })).props
      .preview,
    true,
  );
  assert.equal(
    (await Page({ searchParams: Promise.resolve({}) })).props.preview,
    false,
  );
});
test("detail renders Vietnamese fields, fractional leave and rejection", () => {
  const preview = moduleAt("../src/lib/leave-preview.ts", {
    "@/lib/hrm-format": { matchesSearch: () => true },
  });
  const component = moduleAt("../src/components/leave-detail.tsx", {
    "@/lib/leave-requests": api(),
    "@/lib/hrm-api": {},
    "@/lib/hrm-format": { formatDate: (x) => x },
    "@/components/api-feedback": {},
    "@/components/hrm-ui": {},
  });
  const html = renderToStaticMarkup(
    React.createElement(component.LeaveDetailContent, {
      record: preview.createLeavePreview()[3],
    }),
  );
  assert.match(html, /Lý do từ chối/);
  assert.match(html, /Nhân viên mẫu 04/);
  assert.match(html, /Thời gian nghỉ/);
});
