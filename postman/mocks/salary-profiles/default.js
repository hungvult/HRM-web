// Synthetic contract fixture from HRM-backend develop 5bc642c, not production data.
// Run through Postman simulation, or directly: PORT=4492 node <this file>.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Postman mock scripts execute in a CommonJS sandbox.
const http = require("node:http");
const today = "2026-10-28";
const departments = [
  { id: 1, code: "HR", name: "Nhân sự" },
  { id: 2, code: "IT", name: "Kỹ thuật" },
];
const employees = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1,
  employeeCode: `QA${String(i + 1).padStart(4, "0")}`,
  fullName: `Nhân viên kiểm thử ${String(i + 1).padStart(2, "0")}`,
  department: departments[i % 2],
}));
let nextId = 50;
let profiles = [
  {
    id: 1,
    employeeId: 1,
    effectiveFrom: "2026-09-01",
    effectiveTo: "2026-09-30",
    baseSalary: 15000000,
    allowance: 1000000,
    deduction: 0,
    editable: false,
  },
  {
    id: 2,
    employeeId: 1,
    effectiveFrom: "2026-10-01",
    effectiveTo: null,
    baseSalary: 16000000,
    allowance: 1500000,
    deduction: 500000,
    editable: true,
  },
  {
    id: 3,
    employeeId: 3,
    effectiveFrom: "2026-11-01",
    effectiveTo: null,
    baseSalary: 18000000,
    allowance: 0,
    deduction: 0,
    editable: true,
  },
  {
    id: 4,
    employeeId: 4,
    effectiveFrom: "2026-09-01",
    effectiveTo: "2026-09-30",
    baseSalary: 14000000,
    allowance: 0,
    deduction: 0,
    editable: false,
  },
].map((x) => ({
  ...x,
  createdAt: "2026-10-01T08:00:00+07:00",
  updatedAt: "2026-10-01T08:00:00+07:00",
}));
const normalize = (x) =>
  x
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
async function readBody(req) {
  if (req.body !== undefined)
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw);
}
function paginate(rows, url) {
  const page = Number(url.searchParams.get("page") || 0),
    size = Number(url.searchParams.get("size") || 10);
  return {
    content: rows.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements: rows.length,
    totalPages: Math.ceil(rows.length / size),
    hasNext: (page + 1) * size < rows.length,
  };
}
function row(employee) {
  const history = profiles.filter((x) => x.employeeId === employee.id);
  const currentProfile = history.find(
    (x) =>
      x.effectiveFrom <= today && (!x.effectiveTo || x.effectiveTo >= today),
  );
  const profileState = currentProfile
    ? "CURRENT"
    : !history.length
      ? "NONE"
      : history.some((x) => x.effectiveFrom > today)
        ? "FUTURE"
        : "HISTORICAL";
  return { employee, profileState, currentProfile: currentProfile ?? null };
}
function closeIntervals(employeeId) {
  const history = profiles
    .filter((x) => x.employeeId === employeeId)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  history.forEach((profile, i) => {
    if (!history[i + 1]) profile.effectiveTo = null;
    else {
      const date = new Date(history[i + 1].effectiveFrom + "T00:00:00Z");
      date.setUTCDate(date.getUTCDate() - 1);
      profile.effectiveTo = date.toISOString().slice(0, 10);
    }
  });
}
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const send = (status, body) => {
      console.log(
        JSON.stringify({ method: req.method, path: url.pathname, status }),
      );
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      if (path === "/auth/login" && req.method === "POST") {
        const { usernameOrEmail } = await readBody(req);
        return send(200, {
          accessToken:
            usernameOrEmail === "admin_qa" ? "salary-qa-admin" : "salary-qa-hr",
        });
      }
      const hr = req.headers.authorization === "Bearer salary-qa-hr";
      if (path === "/me/profile")
        return send(200, {
          id: 90,
          username: hr ? "hr_qa" : "admin_qa",
          email: "qa@example.test",
          roles: [hr ? "HR" : "ADMIN"],
          employee: {
            id: 90,
            employeeCode: "QA0090",
            fullName: "Nhân sự kiểm thử",
          },
        });
      if (path === "/notifications/unread-count")
        return send(200, { unreadCount: 0 });
      if (path === "/departments")
        return send(
          200,
          paginate(
            departments.map((x) => ({ ...x, status: "ACTIVE" })),
            url,
          ),
        );
      if (!path.startsWith("/payroll/salary-profiles"))
        return send(501, { message: "Route outside salary fixture" });
      if (!hr) return send(403, { code: "FORBIDDEN", message: "HR required" });
      if (path === "/payroll/salary-profiles/employees") {
        const q = normalize(url.searchParams.get("q") || "");
        if (q === "simulate-error")
          return send(500, { message: "Synthetic upstream failure" });
        return send(
          200,
          paginate(
            employees
              .map(row)
              .filter(
                (x) =>
                  normalize(
                    x.employee.employeeCode + " " + x.employee.fullName,
                  ).includes(q) &&
                  (!url.searchParams.get("departmentId") ||
                    String(x.employee.department.id) ===
                      url.searchParams.get("departmentId")) &&
                  (!url.searchParams.get("profileState") ||
                    x.profileState === url.searchParams.get("profileState")),
              ),
            url,
          ),
        );
      }
      const historyMatch = path.match(
        /^\/payroll\/salary-profiles\/employees\/(\d+)$/,
      );
      if (historyMatch && req.method === "GET") {
        const employee = employees.find(
          (x) => x.id === Number(historyMatch[1]),
        );
        if (!employee) return send(404, { code: "EMPLOYEE_NOT_FOUND" });
        return send(200, {
          employee,
          profiles: profiles
            .filter((x) => x.employeeId === employee.id)
            .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
        });
      }
      if (
        (path === "/payroll/salary-profiles" && req.method === "POST") ||
        (/^\/payroll\/salary-profiles\/\d+$/.test(path) && req.method === "PUT")
      ) {
        const body = await readBody(req);
        const target =
          req.method === "PUT"
            ? profiles.find((x) => x.id === Number(path.split("/").at(-1)))
            : null;
        if (req.method === "PUT" && !target)
          return send(404, { code: "SALARY_PROFILE_NOT_FOUND" });
        if (target && !target.editable)
          return send(409, { code: "SALARY_PROFILE_LOCKED" });
        const employeeId = target?.employeeId ?? body.employeeId;
        if (!employees.some((x) => x.id === employeeId))
          return send(404, { code: "EMPLOYEE_NOT_FOUND" });
        const errors = [];
        if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(body.effectiveFrom))
          errors.push({
            field: "effectiveFrom",
            message: "Ngày hiệu lực phải là ngày đầu tháng.",
          });
        for (const field of ["baseSalary", "allowance", "deduction"])
          if (
            !Number.isSafeInteger(body[field]) ||
            body[field] < (field === "baseSalary" ? 1 : 0) ||
            body[field] > 999999999999
          )
            errors.push({ field, message: "Số tiền không hợp lệ." });
        if (errors.length)
          return send(422, { code: "VALIDATION_ERROR", errors });
        if (
          profiles.some(
            (x) =>
              x.employeeId === employeeId &&
              x.id !== target?.id &&
              x.effectiveFrom === body.effectiveFrom,
          )
        )
          return send(409, { code: "SALARY_PROFILE_OVERLAP" });
        const saved = {
          ...(target ?? {
            id: nextId++,
            employeeId,
            editable: true,
            createdAt: "2026-10-28T10:00:00+07:00",
          }),
          effectiveFrom: body.effectiveFrom,
          baseSalary: body.baseSalary,
          allowance: body.allowance,
          deduction: body.deduction,
          updatedAt: "2026-10-28T10:00:00+07:00",
        };
        profiles = [...profiles.filter((x) => x.id !== saved.id), saved];
        closeIntervals(employeeId);
        return send(target ? 200 : 201, saved);
      }
      return send(501, { message: "Route outside salary fixture" });
    } catch {
      return send(400, { code: "VALIDATION_ERROR" });
    }
  })
  .listen(process.env.PORT);
