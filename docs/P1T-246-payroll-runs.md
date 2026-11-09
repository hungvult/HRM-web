# P1T-246 — Web tạo, xem và công bố bảng lương tháng

Phạm vi: UC017–UC018, gồm P1T-262 (danh sách/chi tiết), P1T-263 (xem trước và xác nhận tạo), P1T-264 (công bố). Truy cập **Bảng lương** trong sidebar hoặc `/payroll-runs`. Dùng chung header, sidebar, bảng, bộ lọc, phân trang và drawer với các màn hiện có.

## Nghiệp vụ và quyền

- Chỉ tài khoản có vai trò HR được mở và tải dữ liệu; ADMIN không có HR không được mặc định quyền lương. Backend tiếp tục kiểm tra quyền cho mọi API.
- Danh sách lọc theo kỳ và trạng thái; chi tiết tìm theo mã/tên nhân viên, lọc phòng ban và phân trang tại server. Hiển thị riêng tổng toàn kỳ và tổng toàn bộ kết quả theo bộ lọc, không cộng từ trang đang xem.
- Chi tiết sử dụng hồ sơ, phòng ban, công hưởng lương và số tiền đã lưu tại thời điểm tạo; không tính lại lương trên frontend.
- Chọn kỳ đã kết thúc → xem trước → xử lý các vấn đề dữ liệu → xác nhận tạo → kiểm tra chi tiết → xác nhận công bố. Tạo và công bố là hai thao tác riêng.
- Bản xem trước bị vô hiệu khi đổi kỳ, hết hạn hoặc server báo dữ liệu thay đổi. Không cho xác nhận khi còn lỗi đầu vào hoặc kỳ chưa chốt.
- Có hộp xác nhận và chặn bấm lặp khi ghi. Không tự thử lại thao tác ghi khi mất kết nối/500; báo kiểm tra danh sách hoặc chi tiết để xác định kết quả. Sau công bố tải lại trạng thái, người công bố, thời điểm và ẩn nút công bố.
- Có trạng thái đang tải/rỗng/lỗi và tải lại bằng tiếng Việt. Không thêm dashboard, xuất file, sửa/xóa bảng lương, thuế/bảo hiểm hoặc phiếu lương web ngoài phạm vi.

## API đã tích hợp

Đối chiếu backend PR #77 (`90c4fe8`) và #79 (`e880956`), đã merge vào develop; bản sau cùng `4b3f554` đã CD lên Test.

| Thao tác | Method | Endpoint |
| --- | --- | --- |
| Danh sách kỳ | GET | `/api/v1/payroll/runs` |
| Chi tiết kỳ | GET | `/api/v1/payroll/runs/{runId}` |
| Lương nhân viên trong kỳ | GET | `/api/v1/payroll/runs/{runId}/items` |
| Xem trước | POST | `/api/v1/payroll/previews` |
| Xác nhận tạo | POST | `/api/v1/payroll/runs` |
| Công bố | POST | `/api/v1/payroll/runs/{runId}/publish` |

Danh sách gửi cặp `year`, `month` nếu chọn kỳ, `status`, `page` từ 0 và `size`. Chi tiết gửi `q`, `departmentId`, `page`, `size`; bỏ từ khóa trống. Preview gửi `{year, month}`; xác nhận chỉ gửi `{previewToken}`. Không gửi số tiền tính từ giao diện. Phản hồi ghi có kỳ dạng phẳng, phản hồi đọc có `period`; sau ghi đọc lại bằng API chi tiết.

## Kiểm thử và dữ liệu giả lập

```powershell
npm ci
npm run test:hrm
npm run lint
npm run build -- --webpack
postman simulation run postman/simulations/payroll-runs.sim.yaml --port 4496 --no-history --output ndjson
```

Mở terminal khác, chạy bản web với API giả lập:

```powershell
$env:HRM_API_UPSTREAM = 'http://127.0.0.1:4496/backend/api/v1'
npm run start -- --hostname 127.0.0.1 --port 3196
```

Mở `http://127.0.0.1:3196/login`, dùng `payroll_hr` hoặc `payroll_admin`, mật khẩu bất kỳ (chỉ fixture cục bộ). Sau đăng nhập mở `/payroll-runs`. Mô phỏng dùng dữ liệu QA giả, mặc định 14 nhân viên, công chuẩn mẫu 480 phút/ngày; đây không phải quyết định cấu hình nghiệp vụ thực tế.

Điều khiển tình huống mô phỏng qua HTTP cục bộ:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4496/backend/__control -ContentType 'application/json' -Body '{"mode":"blocked"}'
```

Các mode: `ready`, `blocked`, `expired`, `stale`, `uncertain`, `server-error`, `empty`. `uncertain` lưu bảng lương rồi trả 500, giúp kiểm tra không gửi lại tự động và tra được kỳ đã lưu trong danh sách. `GET /backend/__control` trả số lần ghi; khởi động lại simulation để đặt lại fixture. API điều khiển chỉ có trong mock, không đưa vào ứng dụng hay backend thật.

Ngày 01/11/2026: các test tự động đạt 146/146; build Webpack đạt; lint không có lỗi (3 cảnh báo có sẵn). Kiểm tra trình duyệt với simulation đã xác minh tạo/công bố, tìm theo nhân viên, thiếu dữ liệu, hết hạn, stale preview, kết quả ghi không xác định, lỗi server và quyền HR. Kiểm tra API Test thật bằng Postman: 6 request, 7 assertion đạt, gồm lọc khoảng một phía và tham số thiếu trả 400; không tạo/công bố bảng lương thật trong kiểm tra này.

## Điều kiện trước khi nghiệm thu trên server

Test hiện chưa cấu hình biến `PAYROLL_STANDARD_MINUTES_PER_DAY` (backend mặc định 0). Cần chốt số phút công chuẩn/ngày theo nghiệp vụ, cấu hình backend và kiểm tra lại nguồn lương, chấm công, đơn phép trước khi tạo kỳ thật. Frontend hiển thị các vấn đề do preview trả về và chặn tạo khi thiếu đầu vào. Luồng ghi đã kiểm tra với fixture; vẫn cần QA nghiệm thu trên Test sau khi release web và hoàn thiện dữ liệu. Không thay đổi cấu hình hoặc dữ liệu Production trong story này.
