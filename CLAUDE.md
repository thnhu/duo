# CLAUDE.md

Nguồn sự thật đầy đủ: [`docs/vocab-tool-spec.md`](docs/vocab-tool-spec.md) (spec v5) và [`docs/user-journey.md`](docs/user-journey.md). Đọc hai file đó trước khi làm bất kỳ mốc nào. File này chỉ tóm tắt các **nguyên tắc cứng không được phá**, dù đang làm mốc nào.

## Nguyên tắc cứng

1. **Hoàn toàn miễn phí.** Mọi dịch vụ/thư viện thêm vào phải có gói miễn phí vĩnh viễn hoặc tự chạy trên máy người dùng, không tự động tính tiền khi vượt hạn mức. Dịch vụ ngoài phải **thất bại êm** (báo lỗi, giữ nguyên trạng thái, app vẫn dùng được phần còn lại).
2. **Local-first.** IndexedDB (qua Dexie) là nguồn dữ liệu chính trên từng thiết bị. App phải dùng được hoàn toàn khi offline. Đồng bộ (Firebase) chỉ là lớp chạy nền phía trên, không phải nguồn thật.
3. **Kiến trúc module, không hard-code.** Kiểu bài, nguồn nạp từ, `LookupProvider`, `SyncAdapter`, `AiProvider`, `SearchService`, ngôn ngữ, thuộc tính ngữ cảnh (TMRND) và tập giá trị, loại liên kết, tiêu chí thụ đắc, tên cột nhập — tất cả là module/cấu hình đăng ký qua registry, không import cứng lẫn nhau. Thêm/bớt một module không được làm vỡ module khác.
4. **Không sao chép mã nguồn PVO/HUST PVO.** Chỉ mượn mô hình khái niệm (Concept, Example, liên kết, Tree) từ tài liệu công khai của họ. Đây là triển khai độc lập.
5. **Không đọc PDF, không OCR, không AI quét trang.** Dữ liệu vào bằng CSV/XLSX hoặc ghi nhanh thủ công. **AI trong tool chỉ dùng để gợi ý nhãn TMRND** (Tone, Mode, Register, Nuance, Dialect) — không dùng cho việc nào khác, và gợi ý của AI **không bao giờ tự thành đáp án chấm điểm** (phải PO duyệt thành `verified`).
6. **Thuộc tính TMRND gắn vào Example, không gắn vào Concept.** Tone = mức trang trọng, Register = lĩnh vực sử dụng (dễ nhầm, đừng đổi nghĩa).
7. **Lịch ôn tập (spaced repetition) tính theo Example**, không theo Concept.
8. **Mọi dữ liệu từ tra cứu tự động hoặc AI chỉ là gợi ý** (`unverified`/`suggested`) cho đến khi PO duyệt thủ công thành `verified`.
9. **Dữ liệu người dùng không được mất khi nâng cấp cấu trúc.** Mọi thay đổi schema phải có migration; xóa dùng xóa mềm (`deletedAt`) để đồng bộ đúng.
10. **Quyền riêng tư:** chỉ gửi ra ngoài (a) đồng bộ lên tài khoản của chính PO, (b) từ đơn lẻ tới dịch vụ tra cứu từ điển, (c) example mà PO chủ động nhờ AI gợi ý nhãn. Không lưu file gốc đã nhập. Khóa API AI chỉ lưu cục bộ từng thiết bị, không đồng bộ, không commit.
11. **Mobile-first.** Thao tác ít, nút lớn, nhập liệu nhanh (đặc biệt "Ghi nhanh"). Tác vụ nặng chạy nền (Web Worker/async), không làm đơ giao diện.

## Khi bắt đầu một mốc (milestone)

- Đọc mục 10 của spec để biết "Xong khi" của mốc đó, và mục 4 của `user-journey.md` để biết hành trình (J\*) liên quan.
- Mỗi phiên làm việc chỉ nên nhận **một mốc**. Không tự ý làm trước mốc sau.
- Nếu một mục trong spec còn đánh dấu **[MỞ]**, hỏi PO trước khi quyết, đừng tự chọn.

## Stack hiện tại (M0)

TypeScript, React, Vite, PWA (`vite-plugin-pwa`). Hosting: GitHub Pages, repo `duo`, base path `/duo/`.
