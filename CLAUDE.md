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

## Quy ước làm việc

- **Commit message viết bằng tiếng Anh.** Nội dung trao đổi với PO có thể bằng tiếng Việt, nhưng mọi commit message phải viết tiếng Anh (code, docs, spec vẫn giữ tiếng Việt như hiện tại).

## Tiến độ

- Repo: https://github.com/thnhu/duo (nhánh `main`). Live: https://thnhu.github.io/duo/ (GitHub Pages, deploy qua `.github/workflows/deploy.yml`).
- **Đã xong:** M0 (khởi tạo, PWA, hosting), M1 (lõi dữ liệu Dexie), M2 (Ghi nhanh, Hộp chờ duyệt, Thư viện), M2b (Tìm kiếm), M3 (Nhập CSV/XLSX — xem mục 10 spec để biết "Xong khi" từng mốc).
- **Mốc tiếp theo:** chưa bắt đầu — hỏi PO muốn làm M3b (Tra cứu tự động) hay mốc khác trước khi code, đừng tự chọn. Việc còn treo của M3: PO gửi vài dòng đầu file thật từ công cụ ngoài để xác nhận bộ cột (spec 9.2 câu 3).
- **Lưu ý CI đã gặp:** sau run của M1, hai lần push tiếp theo (`7f27ac3`, `4e85e8e`) lên `origin/main` thành công (xác nhận bằng `git ls-remote`) nhưng không tự kích hoạt workflow. Ngay sau đó, một lần `git push` khác còn bị GitHub trả lỗi nội bộ (`fatal error in commit_refs_rules`, rồi `Internal Server Error`) — thử lại lần 3 mới qua. Nhiều khả năng đây là sự cố hạ tầng GitHub tạm thời quanh thời điểm đó, không phải lỗi ở repo/workflow. Cách vượt qua: trigger thủ công qua nút **Run workflow** (`workflow_dispatch`) ở https://github.com/thnhu/duo/actions/workflows/deploy.yml — đã thử và chạy thành công. Nếu push mà sau ~1-2 phút không thấy run mới trong tab Actions, đừng mất thời gian debug sâu — thử push lại hoặc bấm Run workflow thủ công rồi tiếp tục.

## Stack hiện tại

- **M0:** TypeScript, React, Vite, PWA (`vite-plugin-pwa`). Hosting: GitHub Pages, repo `duo`, base path `/duo/`.
- **M1:** Dexie (IndexedDB) ở `src/db` — schema (`schema.ts`), model types (`types.ts`), lớp repository chung có xóa mềm (`repository.ts`), seed Settings/Dictionary mặc định (`seed.ts`, `defaults.ts`). Module registry chung ở `src/core/registry.ts`. Test bằng Vitest + `fake-indexeddb` (`npm run test`).
- **M2:** `react-router-dom` (HashRouter — bắt buộc trên GitHub Pages vì không có server rewrite cho BrowserRouter). Font tự host qua `@fontsource/lora` + `@fontsource/inter`, chỉ subset `latin`/`vietnamese` (đủ cho en/de/vi, tránh phình precache PWA). Token thiết kế ở `src/styles/tokens.css` theo `docs/design/DESIGN.md` — mọi component chỉ dùng `var(--token)`, không hard-code màu/spacing/radius. UI dùng CSS Modules (`*.module.css`) cạnh mỗi component. Màn hình theo tính năng ở `src/features/<tên>/`, primitive dùng chung ở `src/ui/`, shell + bottom nav ở `src/app/Layout.tsx`.
- **M2b:** `src/search/` — interface `SearchService` (`types.ts`), chuẩn hóa F4 có bản đồ vị trí để tô sáng kết quả (`normalize.ts`), engine cục bộ tự dựng chỉ mục trong RAM từ Dexie, tự làm mới qua Dexie hooks, không thêm thư viện (`localSearchService.ts`), đăng ký qua registry ở `index.ts` (màn hình chỉ gọi `getSearchService()`). UI: `src/features/search/` (màn `/search` + `ConceptSuggestions` cho F3 khi tô sáng cụm ở Ghi nhanh/Hộp chờ duyệt). Chưa làm: lọc theo loại liên kết (chưa có liên kết, Bản 3) và F5 (fuzzy/Soundex).
- **M3:** `src/import/` — `fields.ts` (danh sách cột nhập, cấu hình), `csv.ts` (tự nhận dấu phân cách/BOM/mã hóa, fallback windows-1252), `readFile.ts` (CSV/XLSX → bảng chuỗi; XLSX qua `read-excel-file/universal`, tải theo yêu cầu), `mapping.ts` (đoán cột + lưu `ImportMapping`), `build.ts` (kiểm tra từng dòng, tự tìm cụm tô sáng), `plan.ts` (gộp dòng cùng từ, phát hiện trùng, ẩn từ `acquired`), `commit.ts` (ghi 1 transaction, `ImportBatch` để hoàn tác lần nhập gần nhất), `template.ts` (file mẫu; XLSX qua `write-excel-file/universal`). UI: `src/features/import/` (`/import`, 4 bước). **Schema Dexie v2:** thêm bảng `importBatches` (migration giữ nguyên dữ liệu, `Settings.schemaVersion` = 2) và trường tùy chọn `Concept.mode` (`breadth`/`depth`; tiếng Đức luôn `breadth`). `src/core/normalize.ts` dùng chung cho tìm kiếm và nhập. CSV phân tích trên luồng chính (nhanh); XLSX đọc bằng thư viện.
