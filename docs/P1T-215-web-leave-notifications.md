# P1T-215 - Web Thông Báo Nghiệp Vụ Nghỉ Phép

## Phạm Vi

- P1T-177, UC020: danh sách mới nhất trước, phân trang, số chưa đọc, chi tiết, đọc một, đọc tất cả và liên kết đến đơn.
- Route `/notifications`; nút chuông hiện có mở trang này. Không thêm dashboard, push notification, email hoặc SMS.
- Nhánh `feature/P1T-215-web-leave-notifications` tạo từ `develop` theo xác nhận PM ngày 14/10/2026; PR vào `develop` có một commit.

## Trạng Thái API

- Backend PR [#68](https://github.com/hungvult/HRM-backend/pull/68) và [#69](https://github.com/hungvult/HRM-backend/pull/69) đã merge/deploy trên test. Danh sách và số chưa đọc trả HTTP 200 ngày 16/10/2026.
- Client theo controller/DTO thực tế: GET danh sách, GET unread-count, GET chi tiết, PATCH `{id}/read`, PATCH `read-all`, dùng chung auth/proxy `/api/v1` hiện có.
- API bật mặc định. Có thể build lại web với `NEXT_PUBLIC_HRM_NOTIFICATIONS_API_ENABLED=false` để tạm tắt. Khi tắt, không gọi các API thông báo và không hiển thị số 0 như thể đã tải thành công.
- Không fallback dữ liệu mẫu khi API lỗi. Đọc thành công mới làm mới danh sách/số chưa đọc; lỗi đánh dấu đọc vẫn giữ nội dung chi tiết và có thử lại.
- Khóa thao tác đồng thời trong lúc ghi; giữ drawer mở khi request còn chạy. Hủy request khi unmount. Quyền sở hữu luôn được backend kiểm tra.
- Chỉ tạo liên kết nội bộ `/leave-requests/{id}` cho relatedEntity.type=LEAVE_REQUEST và ID nguyên dương an toàn. Không dùng URL hoặc HTML trong nội dung thông báo.
- Route chi tiết đơn cần P1T-214. Mỗi nhánh build độc lập; luồng thông báo -> đơn hoàn chỉnh cần merge cả hai PR frontend và API đọc đơn.
- Backend #69 bổ sung thông báo gửi đơn đến Quản lý trực tiếp có role MANAGER; nếu không có thì gửi HR đang hoạt động. Đã bổ sung migration event_key/index chống trùng. Sự kiện duyệt/từ chối cần API P1T-169 trước khi nghiệm thu xuyên suốt.

## Xem Thử Local

- Chạy `npm run dev -- -p 3018 -H 127.0.0.1` và mở `/notifications?preview=1`.
- Preview chỉ được server cho phép ở development. Nhãn dữ liệu mẫu luôn hiển thị; tất cả thông báo, người dùng và mã đơn đều hư cấu.
- Mở thông báo: chuyển đã đọc, giảm số chưa đọc. Đánh dấu tất cả qua bước xác nhận. Thay đổi chỉ trong bộ nhớ, không ghi DB hoặc gọi API.
- Mở đơn từ thông báo ở bản local kết hợp cả hai nhánh để xem luồng xuyên màn hình.

## Nghiệm Thu Sau Khi Có API

1. Xác nhận quyền, migration, danh sách và số chưa đọc trên test.
2. QA danh sách/chi tiết/đọc một/đọc tất cả bằng API thật sau khi merge FE.
3. Kiểm tra đơn mới/kết quả duyệt hoặc từ chối được tạo đúng người nhận, không tạo trùng; HR nhận đơn cần xử lý theo nghiệp vụ mới.
4. Kiểm tra số chưa đọc trên chuông sau cập nhật, lỗi mạng, phiên hết hạn, thông báo của tài khoản khác, đơn không còn quyền xem.
5. QA toàn bộ app -> web -> app sau khi có API duyệt/từ chối. Chưa Test Done trong giai đoạn chỉ có UI.
