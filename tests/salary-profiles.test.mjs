import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

class ApiError extends Error {
  constructor(status, payload = {}) {
    super("unsafe upstream error");
    this.status = status;
    this.payload = payload;
  }
}
function client(request = async () => ({}), page = request) {
  const source = ts.transpileModule(
    readFileSync(
      new URL("../src/lib/salary-profiles.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const dependencies = {
    "@/lib/api": { apiRequest: request, ApiError },
    "@/lib/hrm-api": { fetchPage: page },
  };
  const sandbox = { exports: {}, Intl, require: (name) => dependencies[name] };
  vm.runInNewContext(source, sandbox);
  return sandbox.exports;
}
const values = () => ({
  effectiveFrom: "2026-11-01",
  baseSalary: "16.000.000",
  allowance: "2.000.000",
  deduction: "0",
});
const plain = (x) => JSON.parse(JSON.stringify(x));

test("UC016 grants management only to HR, including multiple roles", () => {
  const api = client();
  for (const roles of [["ADMIN"], ["MANAGER"], ["EMPLOYEE"], []])
    assert.equal(api.canManageSalary({ roles }), false);
  assert.equal(api.canManageSalary(null), false);
  assert.equal(api.canManageSalary({ roles: ["ADMIN", "HR"] }), true);
});
test("VND input preserves integer precision and rejects decimals, scientific notation and overflow", () => {
  const api = client();
  assert.equal(api.parseSalaryAmount("999.999.999.999"), 999999999999);
  assert.equal(api.parseSalaryAmount("16000000"), 16000000);
  assert.equal(api.parseSalaryAmount(" 16.000.000 "), 16000000);
  assert.equal(api.formatSalaryInput("16000000"), "16.000.000");
  assert.equal(api.formatVnd(undefined), "—");
  for (const input of [
    "",
    "-1",
    "1.5",
    "1,5",
    "1e6",
    "1000000000000",
    "1.00",
    "Infinity",
    "NaN",
    "1 000",
    "16.000.000đ",
  ])
    assert.ok(Number.isNaN(api.parseSalaryAmount(input)), input);
});
test("validates required employee, first day of real month, positive base and nonnegative allowances in Vietnamese", () => {
  const api = client();
  assert.deepEqual(plain(api.validateSalaryForm(values(), 2)), {});
  for (const date of [
    "",
    "2026-11-02",
    "2026-13-01",
    "0000-01-01",
    "2026-1-01",
    "2026-02-30",
  ])
    assert.match(
      api.validateSalaryForm({ ...values(), effectiveFrom: date }, 2)
        .effectiveFrom,
      /ngày đầu tháng/,
    );
  const errors = api.validateSalaryForm(
    { ...values(), baseSalary: "0", allowance: "-1", deduction: "" },
    0,
  );
  assert.match(errors.employeeId, /chọn nhân viên/);
  assert.match(errors.baseSalary, /lớn hơn 0/);
  assert.match(errors.allowance, /không âm/);
  assert.match(errors.deduction, /Vui lòng nhập/);
});
test("employee list uses merged backend contract with all filters and zero-based page", async () => {
  const filters = {
    q: " E0002 ",
    departmentId: "3",
    profileState: "NONE",
    page: 2,
    size: 10,
  };
  const signal = new AbortController().signal;
  await client(undefined, async (path, params, actualSignal) => {
    assert.equal(path, "/payroll/salary-profiles/employees");
    assert.deepEqual(plain(params), { ...filters, q: "E0002" });
    assert.equal(signal, actualSignal);
  }).fetchSalaryEmployees(filters, signal);
});
test("history passes abort signal and rejects invalid IDs before calling server", async () => {
  let calls = 0;
  const signal = new AbortController().signal;
  const api = client(async (path, options) => {
    calls++;
    assert.equal(path, "/payroll/salary-profiles/employees/2");
    assert.equal(options.signal, signal);
  });
  await api.fetchSalaryHistory(2, signal);
  for (const id of [0, -1, 1.2, NaN, Infinity])
    assert.throws(() => api.fetchSalaryHistory(id), /không hợp lệ/);
  assert.equal(calls, 1);
});
test("create and update serialize numeric VND and dates using actual POST/PUT DTOs", async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const api = client(async (path, options) => {
    calls.push({ path, options });
  });
  await api.saveSalaryProfile(2, values(), undefined, signal);
  await api.saveSalaryProfile(
    2,
    { ...values(), baseSalary: "18000000" },
    5,
    signal,
  );
  assert.equal(calls[0].path, "/payroll/salary-profiles");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(plain(calls[0].options.body), {
    employeeId: 2,
    effectiveFrom: "2026-11-01",
    baseSalary: 16000000,
    allowance: 2000000,
    deduction: 0,
  });
  assert.equal(calls[1].path, "/payroll/salary-profiles/5");
  assert.equal(calls[1].options.method, "PUT");
  assert.deepEqual(plain(calls[1].options.body), {
    effectiveFrom: "2026-11-01",
    baseSalary: 18000000,
    allowance: 2000000,
    deduction: 0,
  });
  assert.equal(calls[0].options.signal, signal);
  assert.equal(calls[1].options.signal, signal);
});
test("invalid forms never write, transport failures are not automatically retried", async () => {
  let calls = 0;
  const error = new ApiError(409, { code: "SALARY_PROFILE_LOCKED" });
  const api = client(async () => {
    calls++;
    throw error;
  });
  assert.throws(
    () => api.saveSalaryProfile(2, { ...values(), baseSalary: "-1" }),
    /lớn hơn 0/,
  );
  assert.throws(() => api.saveSalaryProfile(2, values(), 0), /không hợp lệ/);
  assert.equal(calls, 0);
  await assert.rejects(
    api.saveSalaryProfile(2, values(), 5),
    (err) => err === error,
  );
  assert.equal(calls, 1);
});
test("conflicts, server validation and permissions produce Vietnamese feedback without leaking upstream details", () => {
  const api = client();
  assert.match(
    api.salaryErrorMessage(
      new ApiError(409, { code: "SALARY_PROFILE_LOCKED" }),
    ),
    /không thể sửa/,
  );
  assert.match(
    api.salaryErrorMessage(
      new ApiError(409, { code: "SALARY_PROFILE_OVERLAP" }),
    ),
    /tháng này/,
  );
  assert.match(api.salaryErrorMessage(new ApiError(403)), /HR/);
  assert.match(api.salaryErrorMessage(new ApiError(401)), /hết hạn/);
  assert.match(api.salaryErrorMessage(new ApiError(404)), /Không tìm thấy/);
  assert.match(
    api.salaryErrorMessage(
      new ApiError(500, { message: "secret database trace" }),
      true,
    ),
    /Chưa xác nhận/,
  );
  assert.doesNotMatch(
    api.salaryErrorMessage(
      new ApiError(500, { message: "secret database trace" }),
    ),
    /secret/,
  );
  const errors = api.salaryFieldErrors(
    new ApiError(422, {
      errors: [
        { field: "baseSalary", message: "English" },
        { field: "effectiveFrom", message: "English" },
      ],
    }),
  );
  assert.match(errors.baseSalary, /VND nguyên/);
  assert.match(errors.effectiveFrom, /ngày đầu tháng/);
  assert.doesNotMatch(JSON.stringify(errors), /English/);
  assert.match(
    api.salaryFieldErrors(new ApiError(409, { code: "SALARY_PROFILE_OVERLAP" }))
      .effectiveFrom,
    /Tháng này/,
  );
});
