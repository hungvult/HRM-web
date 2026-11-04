import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

class ApiError extends Error {
  constructor(status, payload = {}) {
    super("upstream trace");
    this.status = status;
    this.payload = payload;
  }
}
function client(request = async () => ({}), page = request) {
  const code = ts.transpileModule(
    readFileSync(
      new URL("../src/lib/payroll-runs.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const deps = {
    "@/lib/api": { apiRequest: request, ApiError },
    "@/lib/hrm-api": { fetchPage: page },
  };
  const sandbox = {
    exports: {},
    Intl,
    URLSearchParams,
    require: (name) => deps[name],
  };
  vm.runInNewContext(code, sandbox);
  return sandbox.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const preview = () => ({
  year: 2026,
  month: 10,
  canConfirm: true,
  periodClosed: true,
  previewToken: "token-123",
  expiresAt: "2026-11-01T09:00:00Z",
  issues: [],
});

test("payroll confirmation rejects blocked, expired, invalidated or mismatched periods", () => {
  const api = client(),
    now = Date.parse("2026-11-01T08:00:00Z");
  assert.equal(api.canConfirmPayroll(preview(), "2026-10", now), true);
  for (const next of [
    null,
    { ...preview(), canConfirm: false },
    { ...preview(), periodClosed: false },
    { ...preview(), previewToken: "" },
    { ...preview(), expiresAt: "invalid" },
    { ...preview(), expiresAt: "2026-11-01T08:00:00Z" },
    { ...preview(), issues: [{ severity: "ERROR" }] },
  ])
    assert.equal(api.canConfirmPayroll(next, "2026-10", now), false);
  assert.equal(api.canConfirmPayroll(preview(), "2026-09", now), false);
});
test("last closed month uses company timezone across January and UTC month boundary", () => {
  const api = client();
  assert.equal(
    api.lastClosedMonth(new Date("2026-12-31T18:00:00Z")),
    "2026-12",
  );
  assert.equal(
    api.lastClosedMonth(new Date("2026-10-31T18:00:00Z")),
    "2026-10",
  );
  for (const period of [
    "",
    "0000-01",
    "2026-00",
    "2026-13",
    "2026-1",
    "2026-10-01",
  ])
    assert.equal(api.parsePayrollPeriod(period), null);
});
test("run filters use paired year/month, zero-based page and preserve API totals", async () => {
  const signal = new AbortController().signal;
  const response = { content: [], totalElements: 21, totalPages: 3 };
  const api = client(undefined, async (path, query, actualSignal) => {
    assert.equal(path, "/payroll/runs");
    assert.deepEqual(plain(query), {
      year: 2026,
      month: 10,
      status: "GENERATED",
      page: 2,
      size: 10,
    });
    assert.equal(actualSignal, signal);
    return response;
  });
  assert.equal(
    await api.fetchPayrollRuns(
      { period: "2026-10", status: "GENERATED", page: 2, size: 10 },
      signal,
    ),
    response,
  );
  assert.throws(
    () => api.fetchPayrollRuns({ period: "2026-13" }),
    /kỳ lương hợp lệ/,
  );
});
test("item searches are trimmed and encoded, blank keyword omitted, snapshot totals preserved", async () => {
  let calls = 0;
  const response = {
    content: [],
    filteredSummary: { totalNetSalary: 120000000 },
  };
  const api = client(async (path) => {
    const url = new URL(path, "http://fixture");
    calls++;
    assert.equal(url.pathname, "/payroll/runs/7/items");
    assert.equal(url.searchParams.get("q"), calls === 1 ? "NV & Nguyễn" : null);
    assert.equal(url.searchParams.get("departmentId"), "2");
    return response;
  });
  assert.equal(
    await api.fetchPayrollItems(7, {
      q: " NV & Nguyễn ",
      departmentId: "2",
      page: 0,
      size: 10,
    }),
    response,
  );
  await api.fetchPayrollItems(7, {
    q: " ",
    departmentId: "2",
    page: 0,
    size: 10,
  });
});
test("preview/confirm/publish use exact backend write DTOs and never retry failures automatically", async () => {
  const calls = [],
    signal = new AbortController().signal;
  const api = client(async (path, options) => {
    calls.push({ path, ...options });
    return { id: 7, year: 2026, month: 10 };
  });
  await api.previewPayroll("2026-10", signal);
  await api.confirmPayroll("preview-token", signal);
  await api.publishPayroll(7, signal);
  assert.deepEqual(
    plain(calls).map(({ path, method, body }) => ({
      path,
      method,
      ...(body ? { body } : {}),
    })),
    [
      {
        path: "/payroll/previews",
        method: "POST",
        body: { year: 2026, month: 10 },
      },
      {
        path: "/payroll/runs",
        method: "POST",
        body: { previewToken: "preview-token" },
      },
      { path: "/payroll/runs/7/publish", method: "POST" },
    ],
  );
  assert.ok(calls.every((call) => call.signal === signal));
  let count = 0;
  await assert.rejects(
    client(async () => {
      count++;
      throw new ApiError(500);
    }).confirmPayroll("token"),
  );
  assert.equal(count, 1);
  for (const id of [0, -1, NaN, 1.5])
    assert.throws(() => api.publishPayroll(id), /không hợp lệ/);
  assert.throws(() => api.confirmPayroll(""), /xem trước/);
});
test("business conflicts and uncertain write outcomes have actionable Vietnamese feedback", () => {
  const api = client();
  for (const [code, pattern] of [
    ["PAYROLL_PREVIEW_STALE", /thay đổi/],
    ["PAYROLL_PREVIEW_EXPIRED", /hết hạn/],
    ["PAYROLL_PERIOD_EXISTS", /đã có bảng lương/],
    ["PAYROLL_RUN_STATE_CONFLICT", /tải lại/],
  ])
    assert.match(api.payrollErrorMessage(new ApiError(409, { code })), pattern);
  assert.match(api.payrollErrorMessage(new ApiError(403)), /HR/);
  assert.match(api.payrollErrorMessage(new ApiError(401)), /đăng nhập lại/);
  assert.match(
    api.payrollErrorMessage(new ApiError(500), true),
    /Chưa xác định.*kiểm tra lại/,
  );
  assert.doesNotMatch(
    api.payrollErrorMessage(new ApiError(500, { message: "trace secret" })),
    /trace secret/,
  );
});
