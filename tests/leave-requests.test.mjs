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
  constructor(status, payload) {
    super("API error");
    this.status = status;
    this.payload = payload;
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
    AbortController,
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
    "@/lib/hrm-format": moduleAt("../src/lib/hrm-format.ts"),
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
    client.canReviewLeave(user(["ADMIN"]), { employeeId: 901, status: "PENDING" }),
    false,
  );
  for (const roles of [["EMPLOYEE"], [], ["ADMIN", "HR"], ["MANAGER"]])
    assert.equal(client.canReviewLeave(user(roles), { employeeId: 901, status: "PENDING" }), roles.includes("HR") || roles.includes("MANAGER"));
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
  assert.match(api().validateRejection("a".repeat(2001)), /2.000/);
  assert.equal(api().validateRejection("a".repeat(2000)), "");
  assert.equal(api().validateRejection("  Đã bố trí lại lịch  "), "");
});
test("approve posts no body; reject posts only trimmed reason and forwards abort signal", async () => {
  const calls = [];
  const result = { id: 4, status: "APPROVED", remainingDays: 8.5 };
  const signal = new AbortController().signal;
  const client = api(async (path, options) => {
    calls.push({ path, options });
    return result;
  });
  assert.equal(await client.reviewLeaveRequest(4, "APPROVED", "ignored", signal), result);
  assert.equal(calls[0].path, "/leave-requests/4/approve");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.signal, signal);
  await client.reviewLeaveRequest(4, "REJECTED", "  Điều chỉnh lịch nghỉ  ", signal);
  assert.equal(calls[1].path, "/leave-requests/4/reject");
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(plain(calls[1].options.body), { reason: "Điều chỉnh lịch nghỉ" });
  assert.equal(calls[1].options.signal, signal);
});
test("invalid review inputs never send a write", async () => {
  let calls = 0;
  const client = api(async () => { calls++; });
  for (const id of [0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    await assert.rejects(client.reviewLeaveRequest(id, "APPROVED", ""), /Mã đơn/);
  await assert.rejects(client.reviewLeaveRequest(1, "CANCELLED", ""), /Thao tác/);
  await assert.rejects(client.reviewLeaveRequest(1, "REJECTED", "  "), /Vui lòng/);
  await assert.rejects(client.reviewLeaveRequest(1, "REJECTED", "a".repeat(2001)), /2.000/);
  assert.equal(calls, 0);
});
test("review errors preserve HTTP status and business codes without automatic retries", async () => {
  for (const status of [400, 401, 403, 404, 409, 500]) {
    let calls = 0;
    const error = new ApiError(status, { code: "LEAVE_REQUEST_NOT_PENDING" });
    const client = api(async () => { calls++; throw error; });
    await assert.rejects(client.reviewLeaveRequest(1, "APPROVED", ""), (e) => e === error);
    assert.equal(calls, 1);
  }
});
test("distinct review conflicts have accurate Vietnamese messages", () => {
  const client = api();
  assert.match(client.leaveReviewError(new ApiError(409, { code: "LEAVE_BALANCE_INSUFFICIENT" })), /không đủ/);
  assert.match(client.leaveReviewError(new ApiError(409, { code: "LEAVE_BALANCE_NOT_FOUND" })), /Chưa có số dư/);
  assert.match(client.leaveReviewError(new ApiError(409, { code: "LEAVE_REQUEST_NOT_PENDING" })), /không còn chờ/);
  assert.match(client.leaveReviewError(new ApiError(409)), /trạng thái/);
  for (const status of [401, 403, 404])
    assert.equal(client.leaveReviewError(new ApiError(status)), client.leaveError(new ApiError(status)));
  assert.match(client.leaveReviewError(new ApiError(400)), /2.000/);
  assert.match(client.leaveReviewError(new TypeError("Failed to fetch")), /tải lại đơn trước/);
  assert.match(client.leaveReviewError(new ApiError(500, { message: "secret stack" })), /tải lại đơn trước/);
  assert.doesNotMatch(client.leaveReviewError(new ApiError(500, { message: "secret stack" })), /secret/);
});
test("cancelling an in-flight review preserves abort error", async () => {
  const controller = new AbortController();
  const abort = new DOMException("Aborted", "AbortError");
  const client = api(async (_path, { signal }) => {
    controller.abort();
    assert.equal(signal.aborted, true);
    throw abort;
  });
  await assert.rejects(client.reviewLeaveRequest(1, "REJECTED", "Điều chỉnh lịch", controller.signal), (e) => e === abort);
});
test("list uses only actual PR69 query contract and zero-based paging", async () => {
  const signal = new AbortController().signal;
  await api(undefined, async (path, query, actualSignal) => {
    assert.equal(path, "/leave-requests");
    assert.deepEqual(plain(query), filters());
    assert.equal(actualSignal, signal);
  }).fetchLeaveRequests(filters(), signal);
});
test("P1T-238 searches request code, employee code and Vietnamese name across API pages", async () => {
  const record = (id, name = "Đặng Hoàng Nam") => ({
    id, requestCode: `NP${String(id).padStart(6, "0")}`,
    employeeCode: `E${String(id).padStart(4, "0")}`, employeeName: name,
  });
  const rows = [record(1, "Nguyễn An"), record(105), record(106)];
  for (const [keyword, expected] of [[" NP000105 ", [105]], ["E0105", [105]],
    ["dang hoang nam", [105, 106]], ["ĐẶNG HOÀNG NAM", [105, 106]], ["missing", []]]) {
    const calls = [];
    const controller = new AbortController();
    const client = api(undefined, async (path, query, signal) => {
      calls.push(query.page);
      assert.equal(path, "/leave-requests");
      assert.equal(signal, controller.signal);
      assert.equal(query.status, "PENDING");
      assert.equal(query.leaveTypeId, "2");
      assert.equal(query.fromDate, "2026-10-01");
      assert.equal(query.toDate, "2026-10-31");
      assert.equal(query.size, 100);
      assert.equal(query.q, undefined);
      return { content: query.page === 0 ? rows.slice(0, 1) : rows.slice(1), hasNext: query.page === 0 };
    });
    const result = await client.fetchLeaveRequests({ ...filters(), leaveTypeId: "2",
      fromDate: "2026-10-01", toDate: "2026-10-31" }, controller.signal, keyword);
    assert.deepEqual(plain(result.content.map(x => x.id)), expected);
    assert.equal(result.totalElements, expected.length);
    assert.deepEqual(calls, [0, 1]);
  }
});

test("P1T-238 filters before pagination and reports filtered totals", async () => {
  const client = api(undefined, async (_path, query) => ({
    content: Array.from({ length: 12 }, (_, i) => ({ id: i + 1,
      requestCode: `NP${i + 1}`, employeeCode: "E0001", employeeName: "Trần Hà" })),
    hasNext: false,
  }));
  const result = await client.fetchLeaveRequests({ ...filters(), page: 1 }, undefined, "E0001");
  assert.deepEqual(plain(result.content.map(x => x.id)), [11, 12]);
  assert.equal(result.page, 1);
  assert.equal(result.totalElements, 12);
  assert.equal(result.totalPages, 2);
  assert.equal(result.hasNext, false);
});

test("P1T-238 aborts searches and never returns partial matches on page failure", async () => {
  const controller = new AbortController();
  let calls = 0;
  const cancelled = api(undefined, async () => {
    calls++;
    controller.abort();
    return { content: [{ requestCode: "NP1", employeeCode: "E1", employeeName: "A" }], hasNext: true };
  });
  await assert.rejects(cancelled.fetchLeaveRequests(filters(), controller.signal, "NP"), { name: "AbortError" });
  assert.equal(calls, 1);
  const failing = api(undefined, async (_path, query) => {
    if (query.page) throw new ApiError(403);
    return { content: [{ requestCode: "NP1", employeeCode: "E1", employeeName: "A" }], hasNext: true };
  });
  await assert.rejects(failing.fetchLeaveRequests(filters(), undefined, "NP"), /quyền/);
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

function drawerHarness(onReviewed, props = {}) {
  const slots = [];
  let cursor = 0;
  let cleanup;
  let refreshes = 0;
  const Feedback = () => null;
  const Drawer = () => null;
  const component = moduleAt("../src/components/leave-detail.tsx", {
    react: {
      ...React,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
        return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
      },
      useRef: (initial) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
      useEffect: (effect) => { cleanup ??= effect(); },
    },
    "@/lib/leave-requests": api(),
    "@/lib/hrm-format": { formatDate: (x) => x },
    "@/components/api-feedback": { ApiFeedback: Feedback },
    "@/components/hrm-ui": { Drawer, FormField: () => null },
  }).default;
  const parameters = {
    record: { id: 4, employeeId: 901, status: "PENDING", requestCode: "QA" },
    user: user(["HR"]), loading: false, error: "",
    onReviewed, onClose: () => {}, onRetry: () => {},
    onRefresh: () => { refreshes++; }, ...props,
  };
  const render = () => { cursor = 0; return component(parameters); };
  const nodes = (element) => !element ? [] : Array.isArray(element)
    ? element.flatMap(nodes)
    : typeof element === "object" ? [element, ...nodes(element.props?.children)] : [];
  const text = (element) => Array.isArray(element) ? element.map(text).join("")
    : typeof element === "object" && element ? text(element.props?.children) : String(element ?? "");
  const button = (name) => nodes(render()).find((item) => item.type === "button" && text(item.props.children) === name);
  const form = () => nodes(render()).find((item) => item.type === "form");
  const submit = () => form().props.onSubmit({ preventDefault() {} });
  const feedback = () => nodes(render()).find((item) => item.type === Feedback && item.props.error);
  return { render, nodes, button, submit, feedback, cleanup: () => cleanup(), refreshes: () => refreshes, parameters };
}
test("drawer requires confirmation, locks double submit and unlocks on success", async () => {
  let resolve;
  let calls = 0;
  const harness = drawerHarness(() => { calls++; return new Promise((done) => { resolve = done; }); });
  harness.button("Duyệt đơn").props.onClick();
  harness.submit();
  assert.equal(calls, 0);
  harness.submit();
  harness.submit();
  assert.equal(calls, 1);
  assert.equal(harness.render().props.busy, true);
  assert.equal(harness.button("Đang xử lý...").props.disabled, true);
  resolve();
  await new Promise(setImmediate);
  assert.equal(harness.render().props.busy, false);
  assert.ok(harness.button("Duyệt đơn"));
});
test("failed review retains form, blocks repeated writes and requires refreshing server state", async () => {
  let calls = 0;
  const harness = drawerHarness(async () => { calls++; throw new ApiError(409, { code: "LEAVE_BALANCE_INSUFFICIENT" }); });
  harness.button("Duyệt đơn").props.onClick();
  harness.submit();
  harness.submit();
  await new Promise(setImmediate);
  assert.equal(harness.render().props.busy, false);
  assert.match(harness.feedback().props.error, /không đủ/);
  harness.submit();
  assert.equal(calls, 1);
  assert.equal(harness.button("Xác nhận").props.disabled, true);
  harness.feedback().props.onRetry();
  assert.equal(harness.refreshes(), 1);
  assert.equal(harness.feedback(), undefined);
});
test("rejection textarea validates Vietnamese before confirming, and keeps reason after failure", async () => {
  const harness = drawerHarness(async () => { throw new ApiError(403); });
  harness.button("Từ chối").props.onClick();
  harness.submit();
  assert.equal(harness.button("Xác nhận"), undefined);
  let textarea = harness.nodes(harness.render()).find((item) => item.type === "textarea");
  assert.equal(textarea.props.maxLength, 2000);
  textarea.props.onChange({ target: { value: "Điều chỉnh lịch" } });
  harness.submit();
  harness.submit();
  await new Promise(setImmediate);
  harness.feedback().props.onRetry();
  textarea = harness.nodes(harness.render()).find((item) => item.type === "textarea");
  assert.equal(textarea.props.value, "Điều chỉnh lịch");
});
test("unmount aborts in-flight review without setting an error", async () => {
  let signal;
  let reject;
  const harness = drawerHarness((_record, _decision, _reason, actualSignal) => {
    signal = actualSignal;
    return new Promise((_resolve, fail) => { reject = fail; });
  });
  harness.button("Duyệt đơn").props.onClick();
  harness.submit();
  harness.submit();
  harness.cleanup();
  assert.equal(signal.aborted, true);
  reject(new DOMException("Aborted", "AbortError"));
  await new Promise(setImmediate);
  assert.equal(harness.feedback(), undefined);
});
