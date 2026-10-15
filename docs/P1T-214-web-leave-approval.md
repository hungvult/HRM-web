# P1T-214 - Web Xem, Duyệt Và Từ Chối Đơn Nghỉ Phép

## Phạm Vi

- P1T-175: danh sách, bộ lọc, phân trang, chi tiết và lịch sử xử lý.
- P1T-176: giao diện duyệt/từ chối, lý do từ chối bắt buộc, xác nhận kết quả và chặn tự xử lý đơn.
- Route `/leave-requests` và `/leave-requests/{id}`. Bám shell, bảng, drawer và màu sắc hiện có. Không có ảnh minh chứng, không tạo/hủy đơn trên web.
- Nhánh `feature/P1T-214-web-leave-approval` tạo từ `develop` theo xác nhận PM ngày 14/10/2026. PR vào `develop` có một commit.

## Trạng Thái API

Backend PR [#69](https://github.com/hungvult/HRM-backend/pull/69) đã merge vào develop và triển khai lên test ngày 16/10/2026. Danh sách, lọc ngày, loại phép đã trả HTTP 200 trên test. Chưa có PR/API duyệt hoặc từ chối (P1T-169).

- Client đọc đã được viết theo DTO/controller thực tế của PR #69: `GET /api/v1/leave-requests`, `GET /api/v1/leave-requests/{id}`, `GET /api/v1/leave-types`.
- API đọc bật mặc định, dùng chung phiên đăng nhập và proxy `/api/v1`. Có thể tạm tắt bằng `HRM_LEAVE_READ_ENABLED=false`. Không có fallback mock khi API lỗi.
- API danh sách hiện hỗ trợ status, leaveTypeId, fromDate, toDate, page, size. Chưa hỗ trợ q/employeeId. Tìm kiếm nhân viên bị khóa ngoài preview; không lọc ngầm chỉ trên trang hiện tại, không gửi tham số bị server bỏ qua.
- Chưa nối POST approve/reject vì chưa có hợp đồng API thực tế. Hai nút bị khóa khi chạy bình thường. Backend cần bàn giao DTO lỗi, reason, kết quả cập nhật số dư và xử lý đồng thời trước khi tích hợp.
- Không được đánh dấu Story/Test Done khi chưa tích hợp và QA nghiệm thu trên test.

## Xem Thử Local

- Chạy `npm run dev -- -p 3017 -H 127.0.0.1`.
- Mở `/leave-requests?preview=1`. Preview chỉ được server cho phép khi `NODE_ENV=development`; trên production query này không có tác dụng.
- Dữ liệu hoàn toàn hư cấu, có nhãn dữ liệu mẫu. Không đăng nhập giả vào backend, không gọi API nghỉ phép, không ghi DB.
- Bộ lọc và phân trang xử lý toàn bộ dữ liệu mẫu trước khi chia trang. HR xem toàn bộ mẫu; Quản lý có phạm vi mẫu giới hạn; Nhân viên không có danh sách quản lý. Phạm vi thật do backend quyết định.
- Chọn đơn chờ duyệt, mở chi tiết/lịch sử, thử từ chối với lý do trống, duyệt/từ chối qua bước xác nhận. Thay đổi chỉ giữ trong bộ nhớ, tải lại trang sẽ khôi phục mẫu.
- Đơn của bản thân và đơn đã hoàn tất không được xử lý. Chi tiết trực tiếp cho Nhân viên phục vụ liên kết từ thông báo; backend vẫn kiểm tra quyền sở hữu.

## Nghiệm Thu Sau Khi Có API

1. QA danh sách, bộ lọc ngày, phân trang và chi tiết trên test sau khi merge FE.
2. Bổ sung q/employeeId hoặc thống nhất phạm vi bộ lọc với PM. Bàn giao API duyệt/từ chối.
3. Tích hợp thao tác thật, chặn gửi trùng trong khi lưu, xử lý 409 khi đơn bị người khác xử lý, tải lại đơn/lịch sử sau thành công.
4. QA kiểm tra HR toàn công ty, Quản lý theo phân công, Nhân viên chỉ xem đơn của mình; không tự duyệt.
5. Kiểm tra số dư phép, lịch sử và thông báo với app. Không dùng dữ liệu mẫu để xác nhận luồng nghiệp vụ thật.
