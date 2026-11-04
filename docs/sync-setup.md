# Thiết lập đồng bộ (Firebase, gói Spark miễn phí)

Đồng bộ là tùy chọn: app dùng đầy đủ khi chưa thiết lập hoặc khi mất mạng. Việc thiết lập làm **một lần**, rồi dán cấu hình vào app trên từng thiết bị. Không cần thẻ thanh toán; gói Spark dừng dịch vụ khi hết hạn mức chứ không tính tiền.

## 1. Tạo project Firebase

1. Vào https://console.firebase.google.com → **Add project** (tắt Google Analytics cho gọn).
2. Chọn gói **Spark** (mặc định). **Không** bật Cloud Storage, **không** bật đăng nhập bằng số điện thoại (tốn phí SMS).

## 2. Bật đăng nhập

**Build → Authentication → Get started → Sign-in method:**
- Bật **Email/Password**.
- (Tùy chọn) bật **Google**.

**Authentication → Settings → Authorized domains:** thêm `thnhu.github.io` (bắt buộc để đăng nhập Google chạy trên bản live; email/mật khẩu không cần).

## 3. Tạo Firestore và Security Rules

1. **Build → Firestore Database → Create database** → chọn vùng gần bạn (vd `asia-southeast1`), chế độ **production**.
2. Tab **Rules** → dán nội dung file [`firestore.rules`](../firestore.rules) ở thư mục gốc repo → **Publish**. Rules này chỉ cho mỗi người đọc/ghi dữ liệu của chính mình (`users/{uid}/…`).

## 4. Lấy cấu hình web

**Project settings (bánh răng) → Your apps → Add app → Web (`</>`)** → đặt tên bất kỳ, **không** cần Firebase Hosting → copy khối `firebaseConfig`.

## 5. Dán vào app (làm trên từng thiết bị)

**Hôm nay → ⚙️ Cài đặt → Đồng bộ giữa các thiết bị** → dán khối `firebaseConfig` → **Lưu cấu hình** → **Tạo tài khoản mới** (lần đầu) hoặc **Đăng nhập** (các thiết bị sau, cùng email).

Cấu hình chỉ lưu trên thiết bị đó (không commit, không đồng bộ). Khóa `apiKey` của web app không phải bí mật; bảo mật nằm ở Security Rules.

## Cách hoạt động (tóm tắt)

- Đồng bộ chạy nền: khi mở app, khi có mạng lại, ~5 giây sau mỗi lần sửa, và mỗi 5 phút khi app đang mở. Nút **Đồng bộ ngay** để làm tay.
- Mỗi bản ghi: **bản có `updatedAt` mới hơn thắng**. Lịch sử trả lời (`ReviewLog`) chỉ thêm mới. Xóa là xóa mềm nên lan sang máy khác đúng.
- **Không** đồng bộ: Settings (ngưỡng thụ đắc…), dữ liệu hoàn tác nhập file, khóa API AI, chỉ mục tìm kiếm.
- Hết hạn mức hoặc mất mạng: app báo trạng thái, giữ nguyên dữ liệu trên máy, tự thử lại sau (không thử dồn dập). Luôn có thể dùng **Sao lưu JSON** làm phương án độc lập.
- Hạn mức Spark tham khảo (kiểm lại trên trang chính thức): ~50.000 lượt đọc và ~20.000 lượt ghi mỗi ngày. App chỉ gửi bản ghi thay đổi và gộp theo lô 400.
