import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Compile the real client with only its HTTP dependency replaced by fixtures.
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/lib/accounts.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function createClient(request) {
  const sandbox = {
    exports: {},
    URLSearchParams,
    require: (name) => {
      assert.equal(name, "@/lib/api");
      return { apiRequest: request };
    },
  };
  vm.runInNewContext(compiled, sandbox);
  return sandbox.exports;
}

function fixture(id, fullName = "Trần Thị Hà", status = "ACTIVE") {
  return {
    id,
    username: `employee_${id}`,
    email: `employee_${id}@vteach.site`,
    employeeCode: `E${String(id).padStart(4, "0")}`,
    employeeId: id,
    status,
    roles: ["EMPLOYEE"],
    lastLoginAt: "2026-10-02T08:00:00Z",
    employee: { id, fullName },
  };
}

function withFixtures(records, { serverPageSize = Infinity, detailFailureId } = {}) {
  const calls = [];
  const client = createClient(async (path, { signal } = {}) => {
    signal?.throwIfAborted();
    calls.push(path);
    const url = new URL(path, "https://test.vteach.site/api/v1/");
    if (url.pathname === "/accounts") {
      assert.equal(url.searchParams.has("keyword"), false);
      const status = url.searchParams.get("status");
      const filtered = records.filter((record) => !status || record.status === status);
      const size = Math.min(Number(url.searchParams.get("size")), serverPageSize);
      const start = Number(url.searchParams.get("page")) * size;
      return {
        content: filtered.slice(start, start + size).map((record) => {
          const summary = { ...record };
          delete summary.employee;
          return summary;
        }),
        totalElements: filtered.length,
      };
    }
    const id = Number(url.pathname.split("/").at(-1));
    if (id === detailFailureId) throw new Error("Detail unavailable");
    const record = records.find((record) => record.id === id);
    assert.ok(record, `Unexpected account detail request: ${id}`);
    const detail = { ...record };
    delete detail.lastLoginAt;
    delete detail.employeeCode;
    return detail;
  });
  return { client, calls };
}

for (const keyword of ["Trần Thị Hà", "Thị Hà", "tran thi ha", "  TRẦN   THỊ HÀ  "]) {
  test(`finds the employee name from details: ${keyword}`, async () => {
    const { client } = withFixtures([fixture(1, "Nguyễn Văn Minh"), fixture(2)]);
    const result = await client.fetchUserAccounts({ keyword });
    assert.equal(result.total, 1);
    assert.equal(result.items[0].fullName, "Trần Thị Hà");
    assert.equal(result.items[0].id, "2");
    assert.equal(result.items[0].lastLoginAt, "2026-10-02T08:00:00Z");
    assert.equal(result.items[0].employeeCode, "E0002");
  });
}

test("supports Vietnamese d-with-stroke in names", async () => {
  const { client } = withFixtures([fixture(1, "Đặng Văn Đức")]);
  assert.equal((await client.fetchUserAccounts({ keyword: "dang van duc" })).total, 1);
});

for (const keyword of ["hr_01", "HR@VTEACH.SITE", "E0002"]) {
  test(`retains username, email and employee-code search: ${keyword}`, async () => {
    const hr = { ...fixture(2), username: "hr_01", email: "hr@vteach.site", roles: ["HR"] };
    const { client } = withFixtures([fixture(1, "Nguyễn Văn Minh"), hr]);
    const result = await client.fetchUserAccounts({ keyword });
    assert.equal(result.total, 1);
    assert.equal(result.items[0].username, "hr_01");
  });
}

test("collects every API page before filtering and paginating results", async () => {
  const records = Array.from({ length: 11 }, (_, index) => fixture(index + 1));
  const { client, calls } = withFixtures(records, { serverPageSize: 3 });
  const result = await client.fetchUserAccounts({ keyword: "Hà", page: 2, size: 8 });
  assert.equal(result.total, 11);
  assert.deepEqual(Array.from(result.items, (item) => item.id), ["9", "10", "11"]);
  assert.equal(calls.filter((path) => path.startsWith("/accounts?")).length, 4);
});

test("does not stop at a username match when another account matches by name", async () => {
  const first = { ...fixture(1, "Nguyễn Văn Minh"), username: "ha_admin" };
  const { client } = withFixtures([first, fixture(2)]);
  const result = await client.fetchUserAccounts({ keyword: "ha" });
  assert.equal(result.total, 2);
});

test("preserves the status filter across all scanned pages", async () => {
  const { client, calls } = withFixtures([
    fixture(1, "Trần Thị Hà", "LOCKED"), fixture(2), fixture(3),
  ], { serverPageSize: 1 });
  const result = await client.fetchUserAccounts({ keyword: "Hà", status: "ACTIVE" });
  assert.equal(result.total, 2);
  assert.ok(result.items.every((item) => item.status === "ACTIVE"));
  assert.ok(calls.filter((path) => path.startsWith("/accounts?")).every((path) => path.includes("status=ACTIVE")));
});

test("returns zero, not a negative total, for empty lists and no matches", async () => {
  for (const records of [[], [fixture(1)]]) {
    const { client } = withFixtures(records);
    const result = await client.fetchUserAccounts({ keyword: "missing" });
    assert.equal(result.total, 0);
    assert.equal(result.items.length, 0);
  }
  const { client } = withFixtures([]);
  assert.equal((await client.fetchUserAccounts({})).total, 0);
});

test("keeps regular server pagination when the search is blank", async () => {
  const records = Array.from({ length: 11 }, (_, index) => fixture(index + 1));
  const { client, calls } = withFixtures(records);
  const result = await client.fetchUserAccounts({ keyword: "  ", page: 2, size: 3 });
  assert.equal(result.total, 11);
  assert.deepEqual(Array.from(result.items, (item) => item.id), ["4", "5", "6"]);
  assert.equal(calls.filter((path) => path.startsWith("/accounts?")).length, 1);
  assert.equal(new URL(calls[0], "https://test.vteach.site").searchParams.get("page"), "1");
});

test("retains searchable list fields if one detail request fails", async () => {
  const { client } = withFixtures([fixture(1)], { detailFailureId: 1 });
  const result = await client.fetchUserAccounts({ keyword: "employee_1" });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].employeeCode, "E0001");
});

test("limits simultaneous detail requests to ten", async () => {
  let active = 0;
  let maximum = 0;
  const records = Array.from({ length: 23 }, (_, index) => fixture(index + 1));
  const client = createClient(async (path) => {
    if (path.startsWith("/accounts?")) return { content: records, totalElements: records.length };
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return records.find((record) => String(record.id) === path.split("/").at(-1));
  });
  assert.equal((await client.fetchUserAccounts({ keyword: "Hà" })).total, 23);
  assert.equal(maximum, 10);
});

test("propagates cancellation instead of showing partial search results", async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = createClient(async (path, { signal }) => {
    calls += 1;
    if (path.startsWith("/accounts?")) return { content: [fixture(1)], totalElements: 2 };
    controller.abort();
    signal.throwIfAborted();
  });
  await assert.rejects(client.fetchUserAccounts({ keyword: "Hà" }, controller.signal), { name: "AbortError" });
  assert.equal(calls, 2);
});
