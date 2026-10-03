import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}
const source = ts.transpileModule(
  readFileSync(new URL("../src/lib/hrm-api.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function client(request) {
  const sandbox = {
    exports: {},
    URLSearchParams,
    require: () => ({ apiRequest: request, ApiError }),
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const page = (content, hasNext = false) => ({
  content,
  page: 0,
  size: 100,
  totalElements: content.length,
  totalPages: 1,
  hasNext,
});

test("employee list uses q, status and numeric relationship IDs", async () => {
  let url;
  const api = client(async (path) => {
    url = new URL(path, "https://test.vteach.site");
    return page([]);
  });
  await api.fetchEmployees({
    q: " Trần Thị Hà ",
    employmentStatus: "WORKING",
    departmentId: "5",
    positionId: "6",
    page: 0,
    size: 8,
  });
  assert.equal(url.pathname, "/employees");
  assert.equal(url.searchParams.get("q"), "Trần Thị Hà");
  assert.equal(url.searchParams.get("departmentId"), "5");
  assert.equal(url.searchParams.get("positionId"), "6");
  assert.equal(url.searchParams.get("employmentStatus"), "WORKING");
  assert.equal(url.searchParams.get("page"), "0");
  assert.equal(url.searchParams.has("keyword"), false);
});
test("blank filters are not sent", async () => {
  const api = client(async (path) => {
    const url = new URL(path, "https://test.vteach.site");
    assert.equal(url.searchParams.has("q"), false);
    assert.equal(url.searchParams.has("departmentId"), false);
    return page([]);
  });
  await api.fetchEmployees({ q: " ", departmentId: "", page: 0, size: 8 });
});
for (const [id, method, path] of [
  [undefined, "POST", "/employees"],
  [7, "PATCH", "/employees/7"],
]) {
  test("employee " + method + " sends only supported fields", async () => {
    const api = client(async (actual, options) => {
      assert.equal(actual, path);
      assert.equal(options.method, method);
      assert.deepEqual(plain(options.body), {
        fullName: "Test HRM",
        email: "test@vteach.site",
        phone: "0901234567",
        hireDate: "2026-09-21",
        gender: "FEMALE",
        address: "Hà Nội",
      });
      return { id: 7 };
    });
    await api.saveEmployee(
      {
        fullName: " Test HRM ",
        email: " test@vteach.site ",
        phone: "0901234567",
        hireDate: "2026-09-21",
        gender: "FEMALE",
        address: " Hà Nội ",
        employeeCode: "FORBIDDEN",
        employmentStatus: "TERMINATED",
        departmentId: 5,
      },
      id,
    );
  });
}
test("employee status uses PATCH, enum and reason", async () => {
  const api = client(async (path, options) => {
    assert.equal(path, "/employees/7/status");
    assert.equal(options.method, "PATCH");
    assert.deepEqual(plain(options.body), {
      employmentStatus: "TERMINATED",
      reason: "Kết thúc hợp đồng",
    });
  });
  await api.changeEmployeeStatus(7, "TERMINATED", " Kết thúc hợp đồng ");
});
for (const kind of ["departments", "positions"]) {
  for (const [id, method] of [
    [undefined, "POST"],
    [5, "PUT"],
  ]) {
    test(
      kind +
        " " +
        method +
        " follows current code/rank contract without sending status",
      async () => {
        const api = client(async (path, options) => {
          assert.equal(path, id ? "/" + kind + "/" + id : "/" + kind);
          assert.equal(options.method, method);
          assert.deepEqual(plain(options.body), {
            name: "Danh mục QA",
            description: "Mô tả",
            ...(kind === "departments" && !id ? { code: "QA001" } : {}),
            ...(kind === "positions" ? { rankLevel: 3 } : {}),
          });
        });
        await api.saveCatalog(
          kind,
          {
            name: " Danh mục QA ",
            description: " Mô tả ",
            code: " qa001 ",
            rankLevel: 3,
            status: "INACTIVE",
            level: "L3",
          },
          id,
        );
      },
    );
  }
  test(kind + " changes status with ACTIVE/INACTIVE", async () => {
    const api = client(async (path, options) => {
      assert.equal(path, "/" + kind + "/5/status");
      assert.equal(options.method, "PATCH");
      assert.deepEqual(plain(options.body), {
        status: "INACTIVE",
        reason: "QA",
      });
    });
    await api.changeCatalogStatus(kind, 5, "INACTIVE", " QA ");
  });
}

test("position detail uses GET by ID and preserves rank level", async () => {
  const controller = new AbortController();
  const record = { id: 7, code: "CV000007", name: "Trưởng nhóm", rankLevel: 4 };
  const api = client(async (path, options) => {
    assert.equal(path, "/positions/7");
    assert.equal(options.method ?? "GET", "GET");
    assert.equal(options.signal, controller.signal);
    return record;
  });
  assert.deepEqual(
    plain(await api.fetchPosition(7, controller.signal)),
    record,
  );
});
test("profile is resolved from the authenticated user, not a hardcoded employee", async () => {
  const api = client(async (path, options) => {
    assert.equal(path, "/me/profile");
    assert.equal(options.signal instanceof AbortSignal, true);
    return { username: "hr_01", roles: ["HR"] };
  });
  assert.equal(
    (await api.fetchMyProfile(new AbortController().signal)).username,
    "hr_01",
  );
});
test("profile update sends only phone and address", async () => {
  const api = client(async (path, options) => {
    assert.equal(path, "/me/profile");
    assert.equal(options.method, "PUT");
    assert.deepEqual(plain(options.body), {
      phone: "+84901234567",
      address: "Hà Nội",
    });
  });
  await api.updateMyProfile({
    phone: " +84901234567 ",
    address: " Hà Nội ",
    fullName: "FORBIDDEN",
    employeeId: 999,
    roles: ["ADMIN"],
  });
});
test("assignment POST uses numeric IDs and lets the server choose today's date", async () => {
  const api = client(async (path, options) => {
    assert.equal(path, "/employee-assignments");
    assert.equal(options.method, "POST");
    assert.deepEqual(plain(options.body), {
      employeeId: 7,
      departmentId: 5,
      positionId: 6,
      managerEmployeeId: 1,
    });
  });
  await api.createAssignment({
    employeeId: 7,
    departmentId: 5,
    positionId: 6,
    managerEmployeeId: 1,
    effectiveFrom: "2099-01-01",
    status: "PENDING",
  });
});
test("unassigned manager is omitted, not zero or an empty string", async () => {
  const api = client(async (path, options) => {
    assert.deepEqual(plain(options.body), {
      employeeId: 7,
      departmentId: 5,
      positionId: 6,
    });
  });
  await api.createAssignment({ employeeId: 7, departmentId: 5, positionId: 6 });
});
test("fetchAll follows API pagination instead of truncating at page one", async () => {
  const seen = [];
  const api = client(async (path) => {
    const query = new URL(path, "https://test.vteach.site").searchParams;
    seen.push(Number(query.get("page")));
    assert.equal(query.get("size"), "100");
    assert.equal(query.get("status"), "ACTIVE");
    return page([{ id: seen.length }], seen.length < 3);
  });
  const result = await api.fetchAll("/departments", { status: "ACTIVE" });
  assert.deepEqual(plain(result), [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.deepEqual(seen, [0, 1, 2]);
});
test("assignment directory reads employee histories, never treats /current as a global list", async () => {
  let pending = 0;
  let maximum = 0;
  const employees = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
  }));
  const api = client(async (path) => {
    if (path.startsWith("/employees?")) return page(employees);
    assert.match(path, /^\/employees\/\d+\/assignments\?/);
    pending++;
    maximum = Math.max(maximum, pending);
    await new Promise((resolve) => setTimeout(resolve, 1));
    pending--;
    const id = Number(path.split("/")[2]);
    return page([
      { id, employee: { id }, effectiveFrom: "2026-10-01", isCurrent: true },
    ]);
  });
  const result = await api.fetchAssignmentDirectory();
  assert.equal(result.assignments.length, 12);
  assert.equal(maximum, 5);
  assert.equal(result.assignments[0].id, 12);
});
test("permission guard grants management only to ADMIN or HR", () => {
  const api = client(async () => {});
  assert.equal(api.canManageHrm(null), false);
  for (const role of ["ADMIN", "HR"])
    assert.equal(api.canManageHrm({ roles: [role] }), true);
  for (const role of ["MANAGER", "EMPLOYEE"])
    assert.equal(api.canManageHrm({ roles: [role] }), false);
});
test("server field errors and business conflicts are preserved for forms", () => {
  const api = client(async () => {});
  assert.equal(
    api.getErrorMessage(
      new ApiError("Error", 400, {
        errors: [{ field: "phone", message: "Số điện thoại không hợp lệ" }],
      }),
    ),
    "Số điện thoại không hợp lệ",
  );
  assert.equal(
    api.getErrorMessage(
      new ApiError("Error", 409, { message: "Phòng ban đang có nhân viên" }),
    ),
    "Phòng ban đang có nhân viên",
  );
});
test("cancellation stops pagination before another API request", async () => {
  const controller = new AbortController();
  let calls = 0;
  const api = client(async () => {
    calls++;
    controller.abort();
    return page([{ id: 1 }], true);
  });
  await assert.rejects(api.fetchAll("/employees", {}, controller.signal), {
    name: "AbortError",
  });
  assert.equal(calls, 1);
});
test("request failures propagate rather than falling back to mock data", async () => {
  const api = client(async () => {
    throw new ApiError("Bạn không có quyền", 403, {});
  });
  await assert.rejects(api.fetchEmployees({}), { status: 403 });
});

test("department detail uses GET by ID and preserves server fields and cancellation", async () => {
  const controller = new AbortController();
  const department = {
    id: 12,
    code: "PB12",
    name: "Phòng ban mới nhất",
    description: null,
    status: "INACTIVE",
    createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-10-03T00:00:00Z",
  };
  const api = client(async (path, options) => {
    assert.equal(path, "/departments/12");
    assert.equal(options.method ?? "GET", "GET");
    assert.equal(options.body, undefined);
    assert.equal(options.signal, controller.signal);
    return department;
  });
  assert.deepEqual(
    plain(await api.fetchDepartment(12, controller.signal)),
    department,
  );
});

for (const status of [403, 404]) {
  test(`department detail preserves HTTP ${status} rather than returning cached list data`, async () => {
    const api = client(async () => {
      throw new ApiError("Không thể xem phòng ban", status, {
        message: "Không thể xem phòng ban",
      });
    });
    await assert.rejects(api.fetchDepartment(12), { status });
  });
}

test("closing a department drawer can cancel its request", async () => {
  const controller = new AbortController();
  controller.abort();
  const api = client(async (path, options) => options.signal.throwIfAborted());
  await assert.rejects(api.fetchDepartment(12, controller.signal), {
    name: "AbortError",
  });
});
