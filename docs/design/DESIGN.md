# DESIGN: Hệ thống thiết kế (Design System) cho Duo

> Nguồn tham khảo:
> - **Theme (màu sắc, font, cảm giác thị giác):** `docs/theme/color theme.jpg` — một ảnh landing page mẫu ("Wemory"), dùng để rút ra bảng màu và font. Màu hex trong tài liệu này được **lấy mẫu trực tiếp từ pixel của ảnh đó** (không đoán bằng mắt), trừ các màu đánh dấu rõ là "không có trong ảnh, đề xuất thêm".
> - **Wireframe (bố cục, luồng màn hình):** `docs/reference/hustpvo/*` — ảnh chụp màn hình HUST PVO, dùng tham khảo cách bố trí màn hình (cây concept, màn hình tra cứu, nhập liệu...) khi dựng từng screen. **Không dùng màu của HUST PVO** — theme của hai nguồn khác nhau, tài liệu này chỉ dùng wireframe để tham khảo cấu trúc, không phải màu sắc.
> - Quy ước: **[CHỐT theo ảnh]** = lấy đúng từ ảnh theme. **[ĐỀ XUẤT]** = suy ra/thêm mới vì ảnh không có, cần PO duyệt hoặc chỉnh.
> - Tài liệu này **chỉ là thiết kế (chưa viết code giao diện)**. Các đoạn CSS trong bài là ví dụ minh họa cách tổ chức biến, không phải code đã cài vào repo.

---

## 1. Bảng màu

### 1.1 Cách lấy màu

Ảnh `color theme.jpg` dùng một gam **xanh dương pastel duy nhất** làm màu thương hiệu, cộng một màu **mực xanh navy gần đen** cho chữ và nút chính, nền trắng/trắng ngà cho các khối nội dung. Lấy mẫu pixel trực tiếp cho ra:

| Vùng trong ảnh | Mã hex đo được | Dùng làm |
|---|---|---|
| Nền toàn trang (ngoài khối trắng) | `#9BC2E9` | **Primary / màu thương hiệu** |
| Khối nội dung trắng | `#F2F6F9` | Nền phụ (surface tint) |
| 5 dòng danh sách bước (gradient trắng → xanh thương hiệu) | `#FFFFFF → #E7F1FA → #CCE1F4 → #B3D2EF → #9BC2E9` | Thang độ đậm nhạt của Primary (50→400) |
| Nút tối "Start to free" ở thanh điều hướng | `#0B1316` (dao động `#0E1217`–`#131418`) | **Ink** — màu chữ chính và nền nút chính |
| Chữ tiêu đề "Landing page", "It's never too late..." | `#00142C`–`#001024` (cùng họ với Ink) | Trùng với Ink — ảnh dùng **một** màu mực cho cả chữ lẫn nút tối |

→ Kết luận: bảng màu gốc rất tối giản — **1 màu xanh thương hiệu + 1 màu mực navy gần đen + trắng**. Vì vậy hệ thống thiết kế dưới đây build trên đúng 2 màu đó, thêm thang độ đậm/nhạt và vài màu trạng thái (đúng/sai/cảnh báo) mà ảnh không có nhưng app cần (**[ĐỀ XUẤT]**).

### 1.2 Token màu — Light mode

| Token | Hex | Nguồn | Dùng cho |
|---|---|---|---|
| `--color-bg` | `#FFFFFF` | ĐỀ XUẤT | Nền app chính. *(Ảnh dùng xanh `#9BC2E9` phủ toàn trang vì đó là trang landing/marketing; app dùng hằng ngày để ôn từ nên nền trung tính trắng đỡ mỏi mắt hơn khi đọc lâu — xem ghi chú 1.3)* |
| `--color-surface` | `#FFFFFF` | ĐỀ XUẤT | Nền thẻ/card |
| `--color-surface-tint` | `#F2F6F9` | CHỐT theo ảnh | Nền khối phụ, vùng phân biệt nhẹ với surface |
| `--color-primary-100` | `#E7F1FA` | CHỐT theo ảnh | Nền nhạt cho chip/badge/trạng thái "mới" |
| `--color-primary-200` | `#CCE1F4` | CHỐT theo ảnh | Hover nhẹ, nền chọn |
| `--color-primary-300` | `#B3D2EF` | CHỐT theo ảnh | Viền nhấn, thanh tiến trình nền |
| `--color-primary-400` (brand) | `#9BC2E9` | **CHỐT theo ảnh** | Màu thương hiệu chính: icon active, thanh tiến trình, accent |
| `--color-primary-600` | `#4D7CA8` | ĐỀ XUẤT (đậm hoá 400) | Nút outline/text trên nền trắng cần tương phản hơn 400 |
| `--color-ink` | `#0E1A2B` | **CHỐT theo ảnh** | Chữ chính, nền nút chính (primary button) |
| `--color-ink-muted` | `#55697F` | ĐỀ XUẤT (nhạt hoá ink) | Chữ phụ, placeholder, caption |
| `--color-border` | `#DCE6F0` | ĐỀ XUẤT (giữa primary-100/200) | Viền ô nhập, viền card, đường phân cách |
| `--color-success` | `#3A8F6B` (nền `#E3F4EC`) | ĐỀ XUẤT | Trả lời đúng, concept `acquired` |
| `--color-danger` | `#C4584A` (nền `#FBEAE7`) | ĐỀ XUẤT | Trả lời sai, lỗi nhập liệu |
| `--color-warning` | `#C98A2E` (nền `#FBF0DD`) | ĐỀ XUẤT | Cảnh báo (hết hạn mức AI/tra cứu, mất mạng) |

### 1.3 Token màu — Dark mode [ĐỀ XUẤT, ảnh không có bản tối]

Ảnh gốc không có chế độ tối. Suy ra cùng họ màu (navy làm nền thay vì làm chữ, xanh brand giữ nguyên vì đã đủ sáng để nổi trên nền tối):

| Token | Hex | Dùng cho |
|---|---|---|
| `--color-bg` | `#0B1420` | Nền app |
| `--color-surface` | `#121D2E` | Nền thẻ/card |
| `--color-surface-tint` | `#16273B` | Khối phụ |
| `--color-primary-100` | `#1C3A57` | Nền nhạt cho chip |
| `--color-primary-200` | `#23527C` | Hover nhẹ |
| `--color-primary-300` | `#3E76A8` | Viền nhấn |
| `--color-primary-400` (brand) | `#9BC2E9` | Giữ nguyên — đủ sáng trên nền navy |
| `--color-primary-600` | `#CBE0F5` | Nút outline/text sáng hơn trên nền tối |
| `--color-ink` | `#EAF2FA` | Chữ chính (đảo so với light mode) |
| `--color-ink-muted` | `#90A5BC` | Chữ phụ |
| `--color-border` | `#24374C` | Viền |
| `--color-success` | `#4FAE86` (nền `#113327`) | Đúng/acquired |
| `--color-danger` | `#DB7B6C` (nền `#3A1E1A`) | Sai/lỗi |
| `--color-warning` | `#E0A857` (nền `#3A2D12`) | Cảnh báo |

**Ghi chú thiết kế quan trọng:** ảnh theme dùng xanh `#9BC2E9` làm **nền toàn trang** vì đó là một trang landing (xem 1 lần, gây ấn tượng). App Duo thì PO mở **nhiều lần mỗi ngày** để ôn từ — nền xanh bão hoà toàn màn hình cả ngày dễ gây mỏi mắt và khó đọc chữ dày đặc (nghĩa từ, ví dụ, bảng). Vì vậy đề xuất **đảo vai trò**: nền app dùng trắng/navy trung tính, còn xanh `#9BC2E9` dùng làm **accent** (thanh trạng thái, nút phụ, icon active, vòng tiến trình ôn tập, header của màn hình "Hôm nay") — vẫn đúng màu thương hiệu, chỉ đổi cách dùng cho hợp use-case học hằng ngày. Đây là điểm cần PO xác nhận.

---

## 2. Font chữ

### 2.1 Nhận diện từ ảnh

| Vai trò trong ảnh | Đặc điểm quan sát được (crop phóng to) |
|---|---|
| Tiêu đề ("Landing page", "It's never too late to start speaking Italian!", số thứ tự "O1"–"O5") | Serif nhân văn (humanist serif), độ tương phản nét vừa phải, chân chữ (serif) được bo mềm, số kiểu "old-style" (chân số không thẳng hàng), cảm giác ấm/thân thiện chứ không cổ điển nặng nề |
| Nav, nút, mô tả nhỏ ("Wemory", "About · Program · Teachers...", "Log in", "Start to free") | Sans-serif grotesque đơn giản, trọng lượng mảnh–đều, không chân, rất "trung tính UI" |

### 2.2 Font đề xuất (miễn phí, Google Fonts, có hỗ trợ tiếng Việt)

| Vai trò | Font đề xuất | Vì sao giống | Fallback |
|---|---|---|---|
| **Heading / số lớn / chữ cần học nổi bật** | **Lora** | Serif nhân văn, chân bo mềm, số old-style — rất sát với chữ trong ảnh; hỗ trợ tiếng Việt (có dấu) | `Noto Serif`, `Georgia`, `serif` |
| **UI / body / nút / nav / nghĩa từ / ví dụ** | **Inter** | Grotesque trung tính, tối ưu đọc ở cỡ nhỏ trên màn hình, hỗ trợ tiếng Việt đầy đủ, variable font (nhẹ) | `Noto Sans`, `Roboto`, `sans-serif` |

Lora chỉ dùng cho các chỗ mang tính "điểm nhấn cảm xúc" — tiêu đề màn hình, **từ vựng đang học hiển thị to** (giống thẻ flashcard) — vì serif ở cỡ nhỏ, mật độ chữ dày (danh sách từ, bảng, form) sẽ khó đọc hơn sans trên di động. Mọi phần UI chức năng (nút, nav, nhãn, input, bảng, câu ví dụ) dùng Inter.

### 2.3 Thang cỡ chữ (mobile-first)

| Token | Cỡ / line-height | Font | Dùng cho |
|---|---|---|---|
| `--font-display` | 32px / 1.2, weight 600 | Lora | Từ vựng đang học (hiển thị lớn khi ôn tập) |
| `--font-h1` | 24px / 1.3, weight 600 | Lora | Tiêu đề màn hình ("Hôm nay", "Thư viện từ") |
| `--font-h2` | 18px / 1.4, weight 600 | Inter | Tiêu đề khối/card |
| `--font-body` | 16px / 1.5, weight 400 | Inter | Nội dung chính, nghĩa, ví dụ |
| `--font-label` | 14px / 1.4, weight 500 | Inter | Nhãn, nút, nav |
| `--font-caption` | 12px / 1.4, weight 400 | Inter | Ghi chú, timestamp, meta |

---

## 3. Bo góc (radius)

Ảnh cho thấy **hai cấp bo góc rõ rệt**: nút luôn bo **tròn hết cỡ (pill)**, khối/card bo **vừa phải** (không pill). Đề xuất thang 4 bậc:

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--radius-sm` | 8px | Ô nhập, chip nhỏ, checkbox |
| `--radius-md` | 14px | Card nội dung (ví dụ, concept), modal nhỏ |
| `--radius-lg` | 20px | Khối lớn (section, sheet kéo lên từ dưới) |
| `--radius-pill` | 999px | **Mọi nút**, tag/badge, thanh tìm kiếm |

---

## 4. Khoảng cách (spacing)

Thang 8px, có thêm nấc 4px cho chi tiết nhỏ — phù hợp làm lưới cho màn hình di động:

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--space-1` | 4px | Khoảng cách icon–text sát nhau |
| `--space-2` | 8px | Khoảng cách trong nút, giữa các chip |
| `--space-3` | 12px | Padding trong ô nhập, khoảng cách giữa các field |
| `--space-4` | 16px | Padding card, lề trái/phải màn hình (mobile) |
| `--space-5` | 24px | Khoảng cách giữa các khối/section |
| `--space-6` | 32px | Khoảng cách lớn giữa section chính |
| `--space-7` | 48px | Đầu/cuối trang, vùng an toàn quanh nav |

Lề ngang mặc định cho mobile: **16px** hai bên (giống padding card trong ảnh). Khi màn hình rộng hơn breakpoint tablet, tăng lề lên 24–32px và giới hạn độ rộng nội dung (~640px) để không bị kéo dãn.

---

## 5. Thành phần (components)

### 5.1 Nút (Button)

Quan sát trong ảnh: nút chính là pill nền mực đặc + chữ trắng; nút phụ là pill viền mảnh + chữ mực, nền trong suốt/trắng.

| Biến thể | Nền | Chữ | Viền | Khi nào dùng |
|---|---|---|---|---|
| **Primary** | `--color-ink` | trắng | không | Hành động chính của màn hình (Lưu, Bắt đầu ôn, Nhập) |
| **Secondary (outline)** | trong suốt | `--color-ink` | 1.5px `--color-ink` | Hành động phụ, ngang hàng Primary |
| **Accent (trên nền brand)** | trắng | `--color-ink` | không | Khi nút nằm trên nền xanh brand (ví dụ banner, header) — đảo màu để nổi, đúng cách ảnh gốc làm với nút "Start for free" màu trắng trong hero xanh |
| **Ghost/text** | trong suốt | `--color-primary-600` | không | Hành động nhẹ (Hủy, Bỏ qua, "Xem thêm") |
| **Destructive** | trong suốt | `--color-danger` | 1.5px `--color-danger` | Xóa, bỏ từ |

Quy cách chung: `--radius-pill`, padding `12px 24px` (size `md`), chiều cao tối thiểu **44px** (chuẩn chạm ngón tay di động), font `--font-label` weight 600. Trạng thái `disabled`: giảm opacity còn 40%, bỏ shadow. Trạng thái `:active`: tối màu nền 8% (light) / sáng màu nền 8% (dark).

### 5.2 Thẻ (Card)

Ảnh dùng 2 kiểu thẻ: card nhỏ nền xanh brand phẳng (không viền, không shadow — ví dụ khối "Learn anywhere"), và khối lớn nền trắng chứa nhiều hàng xếp chồng (danh sách 5 bước).

| Thuộc tính | Giá trị |
|---|---|
| Nền | `--color-surface` (mặc định) hoặc `--color-primary-100` (card nhấn nhẹ, ví dụ trạng thái "unverified") |
| Bo góc | `--radius-md` (card đơn lẻ: concept, example) / `--radius-lg` (card chứa danh sách con) |
| Padding | `--space-4` (16px) |
| Viền | không viền khi có nền khác biệt rõ với nền trang; thêm `1px solid var(--color-border)` khi card cùng màu nền trang (để phân tách) |
| Shadow | ảnh gần như không dùng đổ bóng (phong cách phẳng). Chỉ dùng shadow rất nhẹ cho phần tử **nổi trên nội dung khác** (FAB "Ghi nhanh", bottom sheet, modal): `--shadow-md: 0 4px 16px rgba(14,26,43,0.12)` |

### 5.3 Ô nhập (Input)

Ảnh không có form field mẫu — đề xuất theo logic nhất quán với button/card:

| Thuộc tính | Giá trị |
|---|---|
| Nền | `--color-surface` |
| Viền | `1px solid var(--color-border)`; khi focus: `2px solid var(--color-primary-400)` + glow nhẹ `0 0 0 3px var(--color-primary-100)` |
| Bo góc | `--radius-sm` (8px) — **không** pill, để phân biệt rõ với nút, tránh người dùng nhầm ô nhập là nút |
| Padding | `12px 16px` |
| Chữ | `--font-body`, placeholder dùng `--color-ink-muted` |
| Chiều cao tối thiểu | 44px (chuẩn chạm di động) |
| Trạng thái lỗi | viền `--color-danger`, dòng chữ lỗi nhỏ `--font-caption` màu `--color-danger` ngay dưới ô |

Vùng tô sáng (highlight) cụm từ trong câu ví dụ (C7) dùng nền `--color-primary-200` + chữ `--color-ink` đậm; phần còn lại của câu giữ `--color-ink-muted` để mắt tự nhiên tập trung vào cụm tô sáng.

### 5.4 Thanh điều hướng (Navigation) [ĐỀ XUẤT cấu trúc — phần hình ảnh chỉ cho style, không cho cấu trúc]

Mobile-first nên điều hướng chính là **bottom tab bar cố định**, không phải sidebar. Theo bản đồ màn hình ở `user-journey.md` mục 2.3, đề xuất gom lại còn tối đa 5 mục cho vừa bottom bar, các mục còn lại vào trong từng tab hoặc top bar:

```
┌───────────────────────────────────────────┐
│  🏠 Hôm nay   📚 Thư viện  ⊕  🔁 Ôn tập  ⚙️ Cài đặt │
└───────────────────────────────────────────┘
```

- Nút giữa (⊕) là **FAB nổi** cho "Ghi nhanh" — hành động dùng nhiều nhất, nhanh nhất theo J2, nên đặt ở vị trí dễ bấm nhất bằng ngón cái.
- "Nhập từ file" không có tab riêng — đặt làm hành động trong "Thư viện" hoặc "Hôm nay" (ít dùng hơn, không cần chiếm 1/5 bottom bar).
- "Tìm kiếm" (F1) đặt ở **top app bar** của "Hôm nay" và "Thư viện" (icon kính lúp, theo đúng spec mục F1), không chiếm chỗ bottom bar.

| Thuộc tính | Giá trị |
|---|---|
| Nền | `--color-surface` + viền trên `1px solid var(--color-border)` (light) / shadow nhẹ hướng lên (dark) |
| Icon/label mục đang chọn | `--color-primary-600` (light) hoặc `--color-primary-400` (dark), có nền pill `--color-primary-100` phía sau icon |
| Icon/label mục chưa chọn | `--color-ink-muted` |
| FAB | nền `--color-ink`, icon trắng, `--radius-pill`, kích thước 56×56px, `--shadow-md`, nổi cao hơn thanh nav ~8px |
| Top app bar | nền `--color-bg` (liền mạch với nội dung, không viền) hoặc `--color-primary-100` cho màn hình "Hôm nay" để tạo điểm nhấn thương hiệu ngay khi mở app |

---

## 6. Cài đặt để đổi theme chỉ cần sửa một chỗ

Đề xuất tổ chức toàn bộ token ở trên thành **CSS custom properties** trong một file duy nhất, ví dụ `src/styles/tokens.css`, import một lần ở `src/main.tsx`. Mọi component chỉ được dùng `var(--token-name)`, **không hard-code hex** ở bất kỳ file `.css`/`.tsx` nào khác — khi cần đổi thương hiệu/màu, chỉ sửa file này.

```css
/* src/styles/tokens.css — ví dụ minh họa, chưa phải code thật trong repo */
:root {
  /* Màu — light mode (mặc định) */
  --color-bg: #ffffff;
  --color-surface: #ffffff;
  --color-surface-tint: #f2f6f9;
  --color-primary-100: #e7f1fa;
  --color-primary-200: #cce1f4;
  --color-primary-300: #b3d2ef;
  --color-primary-400: #9bc2e9;
  --color-primary-600: #4d7ca8;
  --color-ink: #0e1a2b;
  --color-ink-muted: #55697f;
  --color-border: #dce6f0;
  --color-success: #3a8f6b;
  --color-success-bg: #e3f4ec;
  --color-danger: #c4584a;
  --color-danger-bg: #fbeae7;
  --color-warning: #c98a2e;
  --color-warning-bg: #fbf0dd;

  /* Font */
  --font-heading: 'Lora', 'Noto Serif', Georgia, serif;
  --font-ui: 'Inter', 'Noto Sans', Roboto, sans-serif;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-pill: 999px;

  /* Spacing */
  --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-5: 24px; --space-6: 32px; --space-7: 48px;

  /* Shadow */
  --shadow-md: 0 4px 16px rgba(14, 26, 43, 0.12);
}

/* Dark mode: theo hệ thống, trừ khi PO tự chọn trong Cài đặt */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0b1420;
    --color-surface: #121d2e;
    --color-surface-tint: #16273b;
    --color-primary-100: #1c3a57;
    --color-primary-200: #23527c;
    --color-primary-300: #3e76a8;
    --color-primary-400: #9bc2e9;
    --color-primary-600: #cbe0f5;
    --color-ink: #eaf2fa;
    --color-ink-muted: #90a5bc;
    --color-border: #24374c;
    --color-success: #4fae86;
    --color-success-bg: #113327;
    --color-danger: #db7b6c;
    --color-danger-bg: #3a1e1a;
    --color-warning: #e0a857;
    --color-warning-bg: #3a2d12;
  }
}

/* Cho phép PO ép sáng/tối thủ công từ màn hình Cài đặt (ghi đè prefers-color-scheme) */
:root[data-theme='light'] { color-scheme: light; /* set lại toàn bộ biến light ở đây nếu khác hệ thống */ }
:root[data-theme='dark']  { color-scheme: dark;  /* set lại toàn bộ biến dark ở đây */ }
```

Vì sao chỉ sửa một chỗ: component chỉ tham chiếu `var(--color-primary-400)`, `var(--radius-pill)`,... Đổi thương hiệu (ví dụ PO muốn thử tông xanh lá) chỉ cần đổi giá trị hex trong khối `:root` này — không phải tìm/sửa hex rải rác trong từng file component. Nếu sau này thêm Tailwind hoặc CSS-in-JS, map các token này vào `theme.extend` của Tailwind để vẫn giữ **một nguồn sự thật duy nhất** cho màu/spacing/radius.

---

## 7. Việc KHÔNG áp dụng từ ảnh theme

- Nền xanh phủ toàn màn hình kiểu landing page — xem lý do ở mục 1.3.
- Hình minh họa vẽ tay (ông bà, chai rượu, cá, trái tim...) — phong cách marketing, không phù hợp app công cụ học tập hằng ngày; không đưa illustration vào hệ thống thiết kế này.
- Hình khối "flag/notch" ở đáy card hero (cắt lõm hình chữ V ở giữa) — chi tiết trang trí đặc thù của landing page mẫu, không nhân rộng cho card trong app.
- Màu/kiểu dáng từ ảnh trong `docs/reference/hustpvo/` — chỉ dùng các ảnh đó để tham khảo **bố cục** khi dựng từng màn hình cụ thể ở các mốc sau, không lấy màu.
