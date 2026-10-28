# Salary profile UI verification

Created 2026-10-28 for P1T-245. Contract source: HRM-backend develop 5bc642c, PayrollSalaryProfileController and DTOs. Local synthetic mock only; no published owner mock or workspace binding is available in this checkout. No live salary data or authentication credentials are used.

## Run

`postman simulation run postman/simulations/salary-profiles.sim.yaml --port 4490 --output ndjson --no-history`

Set HRM_API_UPSTREAM to the listening backend member URL plus `/api/v1`, then run the real web. For direct Node fallback use PORT=4492 and `node postman/mocks/salary-profiles/default.js`; upstream is http://127.0.0.1:4492/api/v1.

## Fixtures and limits

- Login hr_qa with any synthetic password grants mock HR; admin_qa grants only mock ADMIN. These tokens have no meaning outside this fixture.
- 14 synthetic employees, two departments, locked September/current October/future November/no-profile cases; fixed business date 2026-10-28.
- POST/PUT writes stay in memory; restart resets fixtures. Query simulate-error returns 500. Out-of-scope routes return 501.
- Expected: HR search/filter/page, create/update, Vietnamese validation, cancel without write, locked history, duplicate-month conflict, access denied for ADMIN.
- Simulation cannot establish actual server authorization, database transaction guarantees, or deployment health.

## Observations

2026-10-28: Postman CLI simulation started on port 4490 and served the backend member. Real web production build used HRM_API_UPSTREAM=http://127.0.0.1:4490/backend/api/v1. Logs captured GET list/history, POST create (201), PUT update (200), duplicate-month POST (409), login/profile and departments. Browser verified paging, combined department/state filters, Vietnamese validation, create 16,000,000 VND, update 18,000,000 VND, cancel preserving that amount, and no edit action for locked September history. No backend member remained silent.

Browser additionally verified an empty search, a synthetic 500 response, a 390px-wide form without horizontal overflow, and direct URL access as ADMIN showing neither salary menu nor salary table. These establish frontend behavior against the fixture only. Enter native date fields through keyboard events when the browser tool's fill does not commit a React change.

The handler must use CommonJS, even with .mjs suffix; import syntax is rejected. With interception enabled, read req.body first rather than re-reading the request stream, which produced duplicated input in this CLI. The in-memory records survived subsequent requests in this local run; deployed mock persistence is not established. These checks do not replace QA on the real Test server.
