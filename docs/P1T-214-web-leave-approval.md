# P1T-214 - Web Xem, Duyệt Và Từ Chối Đơn Nghỉ Phép

## Phạm Vi

- P1T-175: danh sách, bộ lọc, phân trang, chi tiết và lịch sử xử lý.
- P1T-176: duyệt/từ chối bằng API thật, lý do từ chối bắt buộc, xác nhận kết quả và chặn tự xử lý đơn.
- Route `/leave-requests` và `/leave-requests/{id}`. Bám shell, bảng, drawer và màu sắc hiện có. Không có ảnh minh chứng, không tạo/hủy đơn trên web.
- Phần UI ban đầu đã merge qua PR #27. Phần nối API tiếp tục trên `feature/P1T-214-web-leave-review-api`, tạo từ `develop`; PR vào `develop` có một commit.

## Trạng Thái API

Backend PR [#72](https://github.com/hungvult/HRM-backend/pull/72) duyệt/từ chối và PR [#71](https://github.com/hungvult/HRM-backend/pull/71) cập nhật mô tả đã merge vào develop, có trên OpenAPI môi trường test ngày 17/10/2026.

- Client đọc đã được viết theo DTO/controller thực tế của PR #69: `GET /api/v1/leave-requests`, `GET /api/v1/leave-requests/{id}`, `GET /api/v1/leave-types`.
- API đọc bật mặc định, dùng chung phiên đăng nhập và proxy `/api/v1`. Có thể tạm tắt bằng `HRM_LEAVE_READ_ENABLED=false`. Không có fallback mock khi API lỗi.
- API danh sách hiện hỗ trợ status, leaveTypeId, fromDate, toDate, page, size. Chưa hỗ trợ q/employeeId. Tìm kiếm nhân viên bị khóa ngoài preview; không lọc ngầm chỉ trên trang hiện tại, không gửi tham số bị server bỏ qua.
- `POST /api/v1/leave-requests/{id}/approve` không có body. `POST /api/v1/leave-requests/{id}/reject` gửi `{ "reason": "..." }`, lý do bắt buộc và tối đa 2.000 ký tự.
- Chỉ HR/Quản lý có hồ sơ nhân viên, không phải người gửi và đơn còn PENDING mới có thao tác xử lý. Admin chỉ xem nếu không có thêm role HR/Quản lý. Backend quyết định phạm vi toàn công ty/trực thuộc và kiểm tra quyền ở mỗi lần ghi.
- Cần xác nhận trước khi gửi. Khóa double submit, nút đóng/Escape và thao tác khác trong khi gửi; hủy request khi component unmount. Chỉ thông báo thành công sau phản hồi API; tải lại danh sách, chi tiết, lịch sử và bộ đếm thông báo.
- Phân biệt lỗi thiếu số dư, chưa có số dư, đơn không còn chờ duyệt, 400/401/403/404/409. Lỗi mạng/500 không được tự động gửi lại: yêu cầu tải lại trạng thái trước khi tiếp tục. Giữ lý do từ chối khi lỗi và không cập nhật giả trạng thái/số dư.
- Không được đánh dấu Story/Test Done khi chưa tích hợp và QA nghiệm thu trên test.

## Xem Thử Local

- Chạy `npm run dev -- -p 3017 -H 127.0.0.1`.
- Mở `/leave-requests?preview=1`. Preview chỉ được server cho phép khi `NODE_ENV=development`; trên production query này không có tác dụng.
- Dữ liệu hoàn toàn hư cấu, có nhãn dữ liệu mẫu. Không đăng nhập giả vào backend, không gọi API nghỉ phép, không ghi DB.
- Bộ lọc và phân trang xử lý toàn bộ dữ liệu mẫu trước khi chia trang. HR xem toàn bộ mẫu; Quản lý có phạm vi mẫu giới hạn; Nhân viên không có danh sách quản lý. Phạm vi thật do backend quyết định.
- Chọn đơn chờ duyệt, mở chi tiết/lịch sử, thử từ chối với lý do trống, duyệt/từ chối qua bước xác nhận. Thay đổi chỉ giữ trong bộ nhớ, tải lại trang sẽ khôi phục mẫu.
- Đơn của bản thân và đơn đã hoàn tất không được xử lý. Chi tiết trực tiếp cho Nhân viên phục vụ liên kết từ thông báo; backend vẫn kiểm tra quyền sở hữu.

## Kiểm Tra Ngày 17/10/2026

- Unit/contract/component: quyền Admin/HR/Manager/Employee, chặn tự xử lý và trạng thái cuối, endpoint/body, lý do, mã lỗi, double submit, giữ form khi lỗi và abort khi unmount.
- Qua web local trỏ test, HR duyệt đơn QA NP000007 và từ chối NP000008. Hai đơn tạo mới bằng tài khoản kiểm thử employee_03, lý do có nhãn QA P1T-214; không thay đổi các đơn đã có trước và không thao tác production.
- API xác nhận trạng thái APPROVED/REJECTED, mỗi đơn đúng một lịch sử xử lý; số dư phép năm còn 11/12, chỉ đơn duyệt dùng một ngày. Tạo đúng LEAVE_APPROVED/LEAVE_REJECTED cho nhân viên với liên kết về đơn tương ứng.
- Đã xem drawer desktop và mobile 390x844, không tràn ngang trang.
- Qua giao diện nhân viên: đọc thông báo từ chối làm số chưa đọc giảm từ 2 xuống 1; xác nhận đọc tất cả về 0; mở đơn liên quan thành công và không có nút duyệt/từ chối. Hai thông báo trong tài khoản này đều thuộc các đơn QA mới tạo.
- Gọi duyệt lại đơn QA đã duyệt trả 409 `LEAVE_REQUEST_NOT_PENDING`; Admin và Nhân viên gọi API duyệt trả 403 `AUTH_FORBIDDEN`.
- `npm run test:hrm`: 119/119 đạt; production build thành công. Full lint không có lỗi, còn một cảnh báo font có sẵn ở `src/app/layout.tsx`.

## Còn Chờ

1. API danh sách vẫn thiếu q/employeeId. Backend P1T-167/P1T-185 cần bổ sung tìm kiếm theo nhân viên trước khi bật ô tìm kiếm thật. Không lọc cục bộ trên một trang để thay thế tìm kiếm phía server.
2. QA độc lập trên test sau khi merge FE: ma trận phạm vi Quản lý theo phân công, HR toàn công ty, Nhân viên chỉ đơn của mình; không tự duyệt. Kiểm tra đồng thời hai người xử lý và số dư không bị trừ hai lần.
3. Chưa đánh dấu Story/Test Done chỉ dựa trên code hoặc dữ liệu QA.
