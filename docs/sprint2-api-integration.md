# Tích hợp API Sprint 2

## Chạy local bằng API test

```powershell
$env:HRM_API_UPSTREAM = "https://test.vteach.site/api/v1"
npm ci
npm run dev
```

Client dùng đường dẫn cùng origin `/api/v1`. Khi chạy local, route proxy Next.js đọc `HRM_API_UPSTREAM` ở phía server và chuyển tiếp token/cookie. Không đưa credential vào biến môi trường public. Khi triển khai bằng Nginx, tiếp tục dùng cấu hình proxy API hiện có; không cần đặt biến này.

## Hợp đồng API

- Mã nhân viên/chức vụ được backend tự sinh. Khi tạo phòng ban, nhập mã tối đa 30 ký tự; mã không được thay đổi khi cập nhật.
- Hồ sơ nhân viên: GET/POST `/employees`, GET/PATCH `/employees/{id}`, PATCH `/employees/{id}/status`.
- Danh mục: GET/POST `/departments`, `/positions`; PUT `/{id}`; PATCH `/{id}/status`. Chưa có API xóa. Chức vụ yêu cầu `rankLevel` từ 1 đến 10 khi tạo/cập nhật, và hỗ trợ lọc theo cấp bậc.
- Chi tiết danh mục: GET `/departments/{id}`, `/positions/{id}` khi mở xem/chỉnh sửa. Chờ dữ liệu trước khi hiển thị form; lỗi 403/404/kết nối được hiển thị trong drawer và có nút thử lại.
- Phân công: POST `/employee-assignments`, GET `/employees/{id}/assignments`. API `/employee-assignments/current` chỉ trả phân công của người đăng nhập, không phải danh sách toàn hệ thống.
- Điều chỉnh phân công tạo bản mới; backend đóng bản hiện tại và giữ lịch sử. Chưa có API sửa lịch sử, kết thúc thủ công hoặc lập lịch tương lai. Ngày hiệu lực để backend tự xác định.
- Thông tin cá nhân: GET/PUT `/me/profile`; PUT chỉ gửi số điện thoại và địa chỉ.
- Danh sách dùng tham số `q`, ID phòng ban/chức vụ, enum trạng thái và page bắt đầu từ 0.

## Kiểm thử

```powershell
npm run test:hrm
npm run lint
npm run build
```

Các màn không sử dụng dữ liệu mẫu khi API lỗi. Lỗi nghiệp vụ/validate từ backend hiển thị trong form; chỉ đóng form sau khi ghi thành công. Quyền quản lý lấy từ `/me/profile`; backend vẫn là nơi quyết định quyền truy cập.

Do chưa có API danh sách phân công toàn hệ thống, màn phân công lấy danh sách nhân viên và lịch sử theo từng nhân viên với tối đa 5 request đồng thời. Khi dữ liệu tăng, nên bổ sung API phân công có tìm kiếm, lọc và phân trang phía backend.

## Ghép bốn nhánh

Bốn task P1T-117, P1T-122, P1T-125, P1T-128 dùng cùng phiên bản shell, thư viện API và kiểm thử. Sau khi merge đủ bốn PR, menu nối các trang `/accounts`, `/employees`, `/organization`, `/positions`, `/assignments`, `/profile` trong cùng phiên đăng nhập. Các chức năng chưa triển khai không có đường dẫn giả.

Các bản sửa P1T-149/P1T-150 trên develop phải được giữ lại khi ghép. Mỗi nhánh feature có một commit; không merge thẳng các nhánh môi trường.
