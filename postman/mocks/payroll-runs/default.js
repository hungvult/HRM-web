// Synthetic contract fixture, never real payroll data. Local Postman simulation only.
// Sources: HRM-backend #77 90c4fe8, #79 e880956 (DTOs + controllers).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require("node:http");
const account = {
  id: 9001,
  username: "payroll_hr",
  displayName: "Nhân sự kiểm thử",
};
const departments = [
  { id: 1, code: "HR", name: "Nhân sự" },
  { id: 2, code: "IT", name: "Kỹ thuật" },
];
const work = {
  standardWorkingDays: 22,
  standardMinutesPerDay: 480,
  paidMinutes: 9900,
  paidWorkingDays: 20.625,
};
const rows = Array.from({ length: 14 }, (_, i) => ({
  id: i + 100,
  employee: {
    id: i + 1,
    employeeCode: `QA${String(i + 1).padStart(4, "0")}`,
    fullName: `Nhân viên kiểm thử ${String(i + 1).padStart(2, "0")}`,
    department: departments[i % 2],
  },
  work,
  amounts: {
    baseSalaryMonthly: 16000000,
    allowanceMonthly: 2000000,
    deductionMonthly: 1000000,
    earnedBaseSalary: 15000000,
    earnedAllowance: 1875000,
    earnedDeduction: 937500,
    netSalary: 15937500,
  },
  salaryProfileId: i + 1,
}));
function totals(items) {
  return {
    employeeCount: items.length,
    totalEarnedBaseSalary: items.length * 15000000,
    totalEarnedAllowance: items.length * 1875000,
    totalEarnedDeduction: items.length * 937500,
    totalNetSalary: items.length * 15937500,
  };
}
function run(id, month, status) {
  return {
    id,
    period: { year: 2026, month },
    status,
    workStandard: work,
    summary: totals(rows),
    generatedBy: account,
    generatedAt: "2026-10-01T08:00:00+07:00",
    publishedBy: status === "PUBLISHED" ? account : null,
    publishedAt: status === "PUBLISHED" ? "2026-10-02T08:00:00+07:00" : null,
  };
}
let runs = [run(91, 9, "GENERATED"), run(81, 8, "PUBLISHED")];
const previews = new Map();
let mode = "ready",
  nextId = 100,
  writes = 0;
async function readBody(req) {
  if (req.body !== undefined)
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}
function paginate(items, url) {
  const page = Number(url.searchParams.get("page") || 0),
    size = Number(url.searchParams.get("size") || 10);
  return {
    content: items.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements: items.length,
    totalPages: Math.ceil(items.length / size),
    hasNext: (page + 1) * size < items.length,
  };
}
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost"),
      path = url.pathname.replace(/^\/api\/v1|^\/v1/, "");
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (path === "/__control") {
        if (req.method === "POST") {
          const body = await readBody(req);
          mode = body.mode || "ready";
        }
        return send(200, {
          mode,
          writes,
          runs: runs.map((r) => ({ id: r.id, ...r.period, status: r.status })),
        });
      }
      if (path === "/auth/login") {
        const body = await readBody(req),
          role = body.usernameOrEmail === "payroll_admin" ? "ADMIN" : "HR";
        return send(200, {
          accessToken: `payroll-${role.toLowerCase()}`,
          user: { ...account, roles: [role] },
        });
      }
      const role =
        req.headers.authorization === "Bearer payroll-admin" ? "ADMIN" : "HR";
      if (path === "/me/profile")
        return send(200, {
          ...account,
          email: "qa@example.invalid",
          roles: [role],
        });
      if (path === "/notifications/unread-count")
        return send(200, { unreadCount: 0 });
      if (path === "/departments") return send(200, paginate(departments, url));
      if (path.startsWith("/payroll") && role !== "HR")
        return send(403, { code: "FORBIDDEN" });
      if (path === "/payroll/previews" && req.method === "POST") {
        const period = await readBody(req);
        if (
          runs.some(
            (r) =>
              r.period.year === period.year && r.period.month === period.month,
          )
        )
          return send(409, { code: "PAYROLL_PERIOD_EXISTS" });
        const token = `preview-${Date.now()}`;
        const result = {
          ...period,
          previewToken: token,
          expiresAt: new Date(
            Date.now() + (mode === "expired" ? -1000 : 600000),
          ).toISOString(),
          periodClosed: true,
          status: mode === "blocked" ? "BLOCKED" : "READY",
          canConfirm: mode !== "blocked",
          workStandard: work,
          summary: totals(rows),
          items: rows,
          issues:
            mode === "blocked"
              ? [
                  {
                    severity: "ERROR",
                    code: "PAYROLL_INPUT_STANDARD_MINUTES_MISSING",
                    message: "Chưa cấu hình số phút công chuẩn mỗi ngày.",
                  },
                  {
                    severity: "ERROR",
                    code: "PAYROLL_INPUT_SALARY_MISSING",
                    employee: rows[0].employee,
                    date: null,
                    message: "Chưa có mức lương hiệu lực cho nhân viên.",
                  },
                ]
              : [],
        };
        previews.set(token, result);
        return send(200, result);
      }
      if (path === "/payroll/runs" && req.method === "POST") {
        writes++;
        const { previewToken } = await readBody(req),
          preview = previews.get(previewToken);
        if (mode === "stale")
          return send(409, { code: "PAYROLL_PREVIEW_STALE" });
        if (!preview)
          return send(409, { code: "PAYROLL_PREVIEW_ALREADY_USED" });
        if (Date.parse(preview.expiresAt) <= Date.now())
          return send(410, { code: "PAYROLL_PREVIEW_EXPIRED" });
        if (!preview.canConfirm)
          return send(422, { code: "PAYROLL_INPUT_MISSING" });
        if (preview.savedId) {
          const saved = runs.find((r) => r.id === preview.savedId);
          return send(200, {
            id: saved.id,
            ...saved.period,
            status: saved.status,
          });
        }
        if (
          runs.some(
            (r) =>
              r.period.year === preview.year &&
              r.period.month === preview.month,
          )
        )
          return send(409, { code: "PAYROLL_PERIOD_EXISTS" });
        const saved = {
          ...run(nextId++, preview.month, "GENERATED"),
          period: { year: preview.year, month: preview.month },
          generatedAt: new Date().toISOString(),
        };
        runs.unshift(saved);
        preview.savedId = saved.id;
        if (mode === "uncertain")
          return send(500, { code: "INTERNAL_SERVER_ERROR" });
        return send(201, {
          id: saved.id,
          ...saved.period,
          status: saved.status,
        });
      }
      if (path === "/payroll/runs" && req.method === "GET") {
        if (mode === "server-error")
          return send(500, { code: "INTERNAL_SERVER_ERROR" });
        const filtered = runs.filter(
          (r) =>
            (!url.searchParams.get("year") ||
              r.period.year === Number(url.searchParams.get("year"))) &&
            (!url.searchParams.get("month") ||
              r.period.month === Number(url.searchParams.get("month"))) &&
            (!url.searchParams.get("status") ||
              r.status === url.searchParams.get("status")),
        );
        return send(
          200,
          paginate(
            mode === "empty"
              ? []
              : filtered.map((r) => ({
                  ...r,
                  employeeCount: r.summary.employeeCount,
                  totalNetSalary: r.summary.totalNetSalary,
                })),
            url,
          ),
        );
      }
      const match = path.match(
        /^\/payroll\/runs\/(\d+)(?:\/(items|publish))?$/,
      );
      if (match) {
        const saved = runs.find((r) => r.id === Number(match[1]));
        if (!saved) return send(404, { code: "PAYROLL_RUN_NOT_FOUND" });
        if (match[2] === "publish" && req.method === "POST") {
          writes++;
          saved.status = "PUBLISHED";
          saved.publishedBy = account;
          saved.publishedAt = new Date().toISOString();
          return send(200, {
            id: saved.id,
            ...saved.period,
            status: saved.status,
          });
        }
        if (match[2] === "items") {
          const q = (url.searchParams.get("q") || "").toLowerCase(),
            dep = Number(url.searchParams.get("departmentId"));
          const filtered = rows.filter(
            (row) =>
              (!q ||
                `${row.employee.employeeCode} ${row.employee.fullName}`
                  .toLowerCase()
                  .includes(q)) &&
              (!dep || dep === row.employee.department.id),
          );
          return send(200, {
            ...paginate(filtered, url),
            filteredSummary: totals(filtered),
          });
        }
        return send(200, saved);
      }
      return send(501, { message: "Endpoint outside payroll-runs fixture" });
    } catch {
      return send(400, { code: "VALIDATION_ERROR" });
    }
  })
  .listen(process.env.PORT);
