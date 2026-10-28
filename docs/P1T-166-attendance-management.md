# P1T-166: Web quản lý và điều chỉnh bảng công

## Phạm vi

- Story P1T-166 gồm Sub-task P1T-173 và P1T-174, dùng chung một nhánh `feature/P1T-166-web-attendance-management`.
- Nhánh tạo từ `develop` theo yêu cầu PM ngày 13/10/2026; một commit và PR vào `develop`. Không merge trực tiếp hoặc triển khai production.
- Route `/attendances`, menu Bảng công, sử dụng sidebar/header/bảng/drawer và các thành phần validation hiện có.
- Admin/HR/Quản lý được truy cập. Nhân viên không thấy menu hoặc các thao tác quản lý. Backend là nơi kiểm tra phạm vi dữ liệu tại ngày công.
- Không thêm dashboard, check-in/out trên web, xóa công, bỏ kiểm tra quyền hoặc thay đổi schema DB.

## API được tích hợp

| Thao tác | API |
|---|---|
| Danh sách, tìm kiếm, lọc, phân trang, sắp xếp | GET `/api/v1/attendances` |
| Chi tiết | GET `/api/v1/attendances/{id}` |
| Bổ sung công | POST `/api/v1/attendances` |
| Điều chỉnh | PATCH `/api/v1/attendances/{id}` |
| Lịch sử điều chỉnh, phân trang | GET `/api/v1/attendances/{id}/history` |

Danh sách gửi `q`, `employeeId`, `departmentId`, `status`, `fromDate`, `toDate`, `sortBy`, `sortDirection`, `page`, `size`. Trang giao diện bắt đầu từ 1, trang API bắt đầu từ 0. Bộ lọc trống được bỏ khỏi request. Không lọc giả trên một trang dữ liệu hoặc dùng mock làm fallback khi API lỗi.

Form bắt buộc nhân viên, ngày công, trạng thái và lý do tối đa 1000 ký tự. Giờ ra không trước giờ vào; nếu chỉ có một mốc giờ thì trạng thái phải là INCOMPLETE. Cả hai mốc giờ trống được gửi null theo hợp đồng backend. Form điều chỉnh không gửi employeeId/workDate. workingMinutes chỉ lấy từ backend, không cho người dùng nhập hoặc gửi trong body.

Hiển thị/nhập giờ theo `Asia/Ho_Chi_Minh`, request gửi offset `+07:00` thay vì phụ thuộc múi giờ máy người dùng. Có bước xác nhận trước/sau trước khi lưu, chặn gửi trùng và chặn đóng drawer khi đang lưu. Thành công sẽ tải lại danh sách, chi tiết và lịch sử; lỗi vẫn giữ nội dung đã nhập.

## Giới hạn danh sách nhân viên đối với Quản lý

API `/employees` và `/departments` hiện chỉ phục vụ Admin/HR. Web không gọi hai danh sách toàn công ty bằng tài khoản Quản lý. Quản lý nhập ID nhân viên khi bổ sung/lọc; gợi ý được lấy từ các bản ghi bảng công nằm trong phạm vi API đã trả về. Backend kiểm tra lại quyền tại ngày công trước khi ghi.

Để có bộ chọn nhân viên đầy đủ cho Quản lý, cần backend bổ sung API danh sách nhân viên thuộc quyền theo ngày. Không mở rộng quyền của `/employees` chỉ để phục vụ giao diện.

## Kiểm thử ngày 13/10/2026

- Test tự động cho hợp đồng API, payload, múi giờ, validation tiếng Việt, trạng thái tải/rỗng/lỗi, render dữ liệu và quyền menu/page. Fixtures chỉ nằm trong test, không có dữ liệu giả trong ứng dụng.
- Lint không có lỗi; warning font trong layout là warning có sẵn.
- Build production thành công.
- Trình duyệt local dùng proxy API thật trên `test.vteach.site`; không dùng API production.
- Đăng nhập Admin, mở menu Bảng công, kiểm tra form trống, giờ ra trước giờ vào, bước xác nhận và hủy thao tác.
- POST bổ sung công trả 201; GET chi tiết và lịch sử trả 200; PATCH điều chỉnh trả 200; POST trùng nhân viên-ngày trả 409 và thông báo tiếng Việt.
- Bản ghi QA: ID 10, nhân viên `NV000008` (Nhân viên test 01), ngày 13/10/2026. Giờ vào 08:15:00, giờ ra sau điều chỉnh 17:00:00, thời gian 525 phút. Có hai lịch sử với lý do bắt đầu `[P1T-166 QA]`. Dữ liệu QA được giữ trên DB test để tester đối chiếu; không sửa bản ghi công production.
- Kiểm tra bố cục ở khung desktop mặc định và mobile 390 x 844: sidebar/header/drawer, form và lỗi khoảng ngày. Bảng cuộn ngang trong vùng bảng trên màn hình nhỏ.

## Blocker backend chưa được sửa trong PR web

API GET `/api/v1/attendances` trên test đang trả HTTP 500. Đã tái hiện với khoảng ngày 01/10/2026-13/10/2026, cả khi không gửi status và khi gửi status=PRESENT.

Log backend: `SQLState 42P18: could not determine data type of parameter $10`. Vị trí liên quan: `AttendanceRecordRepository.searchAttendances`, điều kiện `(:status IS NULL OR attendance.attendanceStatus = :status)` và các tham số lọc nullable cần được backend kiểm tra.

Frontend không ép trạng thái mặc định hoặc thay API bằng dữ liệu giả để che lỗi. Màn danh sách hiển thị lỗi tiếng Việt và nút thử lại. Không đánh dấu P1T-173/P1T-166 Done trước khi backend sửa lỗi và QA retest luồng danh sách/tìm kiếm/lọc/phân trang/sắp xếp với API thật, cùng phạm vi quyền HR/Quản lý.
