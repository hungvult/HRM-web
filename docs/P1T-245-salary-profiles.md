# P1T-245 — Web quản lý lương nhân viên

Phạm vi: UC016, gồm P1T-260 (danh sách/chi tiết) và P1T-261 (tạo/cập nhật). Truy cập `/salary-profiles` hoặc mục **Quản lý lương** trong sidebar. Dùng header, sidebar, bộ lọc, bảng, drawer và form chung của hệ thống.

## API tích hợp

Contract đã đối chiếu với `PayrollSalaryProfileController` và DTO trên backend develop `5bc642c` (PR #74).

| Thao tác                            | Method | Endpoint phía client                                     |
| ----------------------------------- | ------ | -------------------------------------------------------- |
| Danh sách nhân viên/lương hiện hành | GET    | `/api/v1/payroll/salary-profiles/employees`              |
| Lịch sử mốc lương                   | GET    | `/api/v1/payroll/salary-profiles/employees/{employeeId}` |
| Thêm mốc                            | POST   | `/api/v1/payroll/salary-profiles`                        |
| Cập nhật mốc                        | PUT    | `/api/v1/payroll/salary-profiles/{profileId}`            |

Danh sách gửi `q`, `departmentId`, `profileState`, `page` từ 0 và `size`. Trạng thái gồm CURRENT, FUTURE, HISTORICAL, NONE. Nhân viên chưa có lương vẫn được hiển thị và chọn từ API này.

POST gửi employeeId, effectiveFrom, baseSalary, allowance, deduction. PUT gửi bốn trường cuối; không gửi employeeId, effectiveTo hoặc editable. Backend tự khép khoảng hiệu lực. Không dùng các endpoint dự kiến trong bản nháp sprint nếu khác controller đã merge.

## Quy tắc giao diện

- Chỉ tài khoản có role HR thấy menu và tải dữ liệu lương. ADMIN đơn thuần không được mặc định có quyền này; backend vẫn là nơi thực thi phân quyền.
- Mức tiền là VND nguyên; lương cơ bản lớn hơn 0; phụ cấp/khấu trừ không âm, mặc định 0; giới hạn từng khoản 999.999.999.999 VND theo service backend.
- Form chấp nhận chuỗi chữ số hoặc định dạng nhóm Việt Nam như 16.000.000; không nhận số lẻ, số mũ, số âm hoặc số vượt giới hạn. Payload gửi số nguyên, không gửi chuỗi có dấu chấm.
- Ngày hiệu lực phải là ngày đầu tháng. Không tự tính lương thực nhận hoặc tự chỉnh khoảng hiệu lực ở frontend.
- Mốc có editable=false chỉ xem; API vẫn kiểm tra lại khi ghi. Xử lý SALARY_PROFILE_OVERLAP/LOCKED, lỗi 400/401/403/404/409/422 và mất kết nối bằng tiếng Việt.
- Hủy không ghi; chống bấm lưu lặp trong lúc request đang chạy. Sau lưu tải lại danh sách và mở lịch sử từ server. Có tải/rỗng/lỗi và thử tải lại; không tự retry thao tác ghi.
- Không triển khai tạo/công bố bảng lương, phiếu lương cá nhân, dashboard hoặc xuất file trong story này.

## Kiểm thử

`npm run test:hrm`, `npm run lint`, `npm run build`. Trên máy Windows có thể dùng `npm run build -- --webpack` nếu Turbopack gặp lỗi tiến trình.

Mô phỏng và dữ liệu giả cục bộ: `postman/simulations/salary-profiles.context.md`. Dùng Postman CLI simulation cùng bản web chạy thật qua HTTP; không ghi DB test/prod. Cần QA xác nhận thêm trên server Test sau khi release và đúng phiên bản API đã được triển khai.
