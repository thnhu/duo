# SPEC: Công cụ học từ vựng Anh – Đức (Breadth & Depth)

> Tài liệu này dành cho Claude Code đọc để triển khai. Product Owner (PO): người dùng, dùng một mình.
> Phiên bản **v8** (làm rõ Concept/Example và triết lý tri-fold, kế hoạch Bản 3, xem mục 12). Trước đó **v7** (bỏ AI gợi ý nhãn). **Tool không đọc PDF và không dùng AI**: PO dùng công cụ ngoài rồi nhập bằng file CSV hoặc XLSX, và gắn nhãn TMRND (Tone, Mode, Register, Nuance, Dialect) bằng tay. Xem mục 12 để biết thay đổi so với các bản trước.
> Quy ước: **[CHỐT]** = đã thống nhất. **[ĐỀ XUẤT]** = đề xuất, có thể chỉnh. **[MỞ]** = chưa quyết định, cần hỏi PO trước khi làm.

---

## 1. Tổng quan

### 1.1 Bài toán
- PO ở trình độ tiếng Anh B2. Từ vựng "sách giáo khoa" đã thụ đắc, nhưng **độ rộng thiếu** ở các vùng từ đời thường mà sách phổ thông không dạy (ví dụ: *chew, swallow, vomit, faint*).
- PO cũng muốn tăng **độ sâu**: dùng từ linh hoạt theo **tone, mode, register, nuance, dialect** (ví dụ "xin chào" có ba cách nói theo mức trang trọng).
- Tiếng Đức mới bắt đầu (A1–A2). PO muốn tránh lặp lại sai lầm của tiếng Anh: học **rộng ngay từ đầu**.

### 1.2 Mục tiêu sản phẩm
Một công cụ web giúp:
1. **Learn:** nạp từ mới có chủ đích (từ file danh sách từ do PO chuẩn bị, hoặc ghi nhanh từ phim/sách).
2. **Acquire:** dùng lặp lại trong nhiều ngữ cảnh đến khi phản xạ nhanh và đúng.

Hai chế độ lớn, dùng được cho cả tiếng Anh và tiếng Đức:
- **Chế độ Rộng (Breadth):** mở rộng số lượng từ.
- **Chế độ Sâu (Depth):** học sắc thái dùng từ, dựa trên mô hình PVO (mục 1.3).

### 1.3 Tham khảo: PVO và HUST PVO

**PVO (Personalized Vocabulary Organizer)** là hệ thống học theo liên kết từ nghiên cứu của TS. Hồ Lê Vũ: người học tự xây mạng từ vựng bằng liên kết ngữ nghĩa (cơ chế association).
**HUST PVO** là sản phẩm độc lập lấy cảm hứng từ ý tưởng đó, kết hợp quyền tự quyết của người học với việc tra cứu từ điển tham khảo.
Tài liệu công khai: https://hieupham2000.github.io/HUSTPVO-documentation/docs/intro

> **Không sao chép mã nguồn của PVO hay HUST PVO.** Đây là bản triển khai độc lập, chỉ mượn ý tưởng và mô hình khái niệm từ tài liệu công khai.

**Mô hình khái niệm của PVO (tóm tắt từ tài liệu công khai), PO chọn dùng đầy đủ [CHỐT]:**

| Khái niệm | Ý nghĩa |
|---|---|
| **Concept** | Một từ, cụm từ hoặc nhóm từ đại diện cho một nghĩa (ví dụ *free*, *look after*, hoặc nhóm như *reason-cause*) |
| **Example** | Một cụm, câu hoặc đoạn văn cho thấy cách dùng. **Example mới là nơi mang các thuộc tính ngữ cảnh** (tone, mode, register, nuance, dialect). Ví dụ *shake a leg*: tone informal, nuance old-fashioned, mode spoken |
| **Dictionary** | Nơi chứa concept và example. Một người dùng có thể có nhiều bộ cho nhiều mục đích (ví dụ giao tiếp, luyện IELTS) |
| **Liên kết concept – concept** | *Association*, *Type of*. Mặc định là không liên kết. Quan hệ cha–con và **không cho phép vòng tròn** |
| **Liên kết example – concept** | *Idiom, Nominal, Agent, Patient, Action, Described by, Describing, Other phrase*. Mặc định là không liên kết |
| **Tree** | Màn hình xem cấu trúc cây của concept |

**Các thuộc tính của Example và tập giá trị — dùng đúng bộ mặc định của PVO [CHỐT]:**

| Thuộc tính | Ý nghĩa | Giá trị |
|---|---|---|
| **Tone** | Mức trang trọng | Neutral (mặc định), Informal, Formal, Slightly informal, Slightly formal |
| **Mode** | Nói hay viết | Neutral (mặc định), Spoken, Written |
| **Register** | Lĩnh vực/ngữ vực | Neutral (mặc định), Academic, Literature, Business, Law, Journalism, Medicine, IT, Other (kèm ghi chú) |
| **Nuance** | Sắc thái | Neutral (mặc định), Old fashioned, Humorous, Oft positive, Oft negative |
| **Dialect** | Phương ngữ | Neutral (mặc định), American, British, Other (kèm ghi chú) |

- Nếu cần gắn nhãn không có trong bộ trên (ví dụ **slang**), PO ghi vào **ô Note** của example, không thêm giá trị mới [CHỐT]. Tập giá trị vẫn lưu dạng cấu hình để sau này mở rộng nếu PO đổi ý.
- Lưu ý thuật ngữ: **Tone = mức trang trọng**, **Register = lĩnh vực sử dụng**.
- **TMRND** là cách viết tắt trong tài liệu này cho 5 thuộc tính: **T**one, **M**ode, **R**egister, **N**uance, **D**ialect.

### 1.4 Thuật ngữ cố định và triết lý tri-fold **[CHỐT, v8]**

**Triết lý PVO (PO giải thích):** PVO là bộ công cụ **tự quản lý kho từ vựng** (self-management): lưu trữ hiệu quả là khi thông tin dễ nạp vào và dễ truy xuất lại, nhờ được **sắp xếp có hệ thống**. Cách học là **tri-fold**: với **một concept (một ý)**, học **ít nhất 3 cách diễn đạt** khác nhau để dùng từ linh hoạt. Ví dụ ý "số lượng nhiều": *a lot of* (Tone Neutral), *a bunch of* (Tone Informal), *a great deal of* (Register Academic).

| Từ | Nghĩa duy nhất | Không phải |
|---|---|---|
| **Word/phrase** | Chuỗi chữ (hình thức): *hello*, *a bunch of*. | Không tự là một thành phần của hệ thống. |
| **Concept** | Một **ý (nút ý nghĩa)** trong kho: có tên, mô tả tiếng Việt; là **chỗ để sắp xếp và tìm lại**. Tên có thể là mô tả ("số lượng nhiều") chứ không nhất thiết là một từ. | Không mang nhãn TMRND. Không phải một câu. |
| **Example** | Một **cách diễn đạt** (word/phrase/câu) đang được dùng, **mang nhãn TMRND**. Lịch ôn tính theo example. | Không phải nút trong cây, không bao giờ là cha/con của concept. |
| **Cha–con** | Chỉ giữa **concept và concept**: `ConceptLink` ghi `childId → parentId` (con → cha). | Không áp dụng cho example. |
| **Tree** | **Màn hình xem** concept theo cha–con; example hiện bên dưới concept, gom theo loại liên kết (chỉ là cách hiển thị). | Không có bảng riêng, không phải đồ thị. |

**Ba kiểu "example nối với concept" (đừng lẫn):**
1. `Example.targetConceptId`: concept **chủ** của example, tức example này là một cách diễn đạt/một câu minh họa của concept đó. Mỗi example tối đa một concept chủ; là khóa của lịch ôn, Hộp chờ duyệt, tìm kiếm.
2. `ExampleLink`: quan hệ **bổ sung** từ example tới một concept khác (một cách nói có thể thuộc nhiều ý), kèm loại (Idiom, Nominal, Agent, Patient, Action, Described by, Describing, Other phrase). Mặc định *Other phrase*.
3. `ConceptLink`: concept–concept (*Association*, *Type of*), con → cha, cấm vòng tròn.

**Đếm tri-fold:** một concept đạt khi có **ít nhất N cách diễn đạt khác nhau ở ít nhất một nhãn TMRND** (N mặc định 3, chỉnh trong Cài đặt). Chỉ example có nhãn `verified` được tính; cách diễn đạt gồm example có concept chủ là concept đó và example nối tới nó bằng `ExampleLink`.

---

## 2. Định nghĩa "Thụ đắc" (Acquire) **[CHỐT]**

PO định nghĩa: thụ đắc là nói/nhận ra/dùng từ **ngay lập tức không cần suy nghĩ** (giống tính nhẩm 15+20=35).

Tiêu chí đo được: một concept chuyển sang trạng thái `acquired` khi PO trả lời **đúng và nhanh, trong nhiều ngữ cảnh khác nhau, qua nhiều ngày**.

Các tham số phải là **cấu hình chỉnh được**, không hard-code. Giá trị mặc định **[ĐỀ XUẤT]**, cần tinh chỉnh sau khi dùng thử:

| Tham số | Mặc định đề xuất | Ghi chú |
|---|---|---|
| `minCorrect` | 5 | Số lần đúng tối thiểu |
| `minDistinctContexts` | 3 | Số example khác nhau |
| `minDistinctDays` | 3 | Trải qua ít nhất 3 ngày khác nhau |
| `maxResponseTimeMs` | thay đổi theo kiểu bài | Gõ chép cần ngưỡng lớn hơn bấm chọn |

Vòng đời trạng thái: `unknown → loaded → acquired`.
Trạng thái được tính ở mức **concept**, từ các ReviewLog (mỗi log gắn với example đã dùng, để đếm ngữ cảnh khác nhau).
Concept `acquired` sẽ được **tự ẩn khỏi danh sách bài** ở bước duyệt từ khi nhập (A6).
Nếu sau này trả lời sai/chậm trở lại, có thể hạ về `loaded` **[ĐỀ XUẤT]**.

---

## 3. Nguyên tắc thiết kế

1. **Hoàn toàn miễn phí [CHỐT].** Không dùng dịch vụ trả phí. Mọi thành phần phải có gói miễn phí vĩnh viễn hoặc tự chạy được trên máy người dùng. Mọi dịch vụ bên ngoài phải **thất bại êm** (hết hạn mức thì báo, không tự tính tiền, app vẫn dùng được các chức năng khác).
2. **Local-first [CHỐT].** Dữ liệu luôn lưu trên thiết bị trước, dùng được khi không có mạng. Đồng bộ tự động chạy nền phía trên (mục 6.3).
3. **Linh hoạt, mở rộng bằng module [CHỐT].** Thêm, bớt, đổi, nâng cấp chức năng không được làm vỡ phần khác. Xem mục 7.
4. **Dùng một người [CHỐT].** Một tài khoản, nhiều thiết bị.
5. **Chạy trên điện thoại và máy tính [CHỐT].** Giao diện ưu tiên mobile.
6. **Xuất xlsx [CHỐT].**
7. **Quyền riêng tư [ĐỀ XUẤT].** File nhập được đọc ngay trên thiết bị, không tải lên máy chủ nào. Dữ liệu rời thiết bị chỉ gồm: (a) đồng bộ lên tài khoản của chính PO (mục 6.3), (b) **từ đơn lẻ** gửi tới dịch vụ tra cứu từ điển (mục 6.5). Không có dịch vụ AI nào nhận dữ liệu của PO.
8. **Mọi dữ liệu do tra cứu tự động tạo ra đều chỉ là gợi ý** (`unverified`) cho đến khi PO duyệt. **Nhãn TMRND chỉ thành đáp án chấm điểm khi PO tự gắn (`verified`).**
9. **Ngoài phạm vi [CHỐT]:** đọc PDF, OCR, quét trang bằng AI. PO dùng công cụ ngoài để chuyển sách thành danh sách từ. Nếu sau này muốn thêm, làm bằng một module nguồn từ mới (mục 7), không đụng lõi. **AI trong tool chỉ phục vụ gợi ý nhãn TMRND** (mục 6.6).

---

## 4. Chức năng

### A. Nguồn từ vựng
| # | Chức năng | Trạng thái |
|---|---|---|
| A1 | **Nhập từ file CSV hoặc XLSX** từ thiết bị (xử lý cục bộ) | CHỐT |
| A1a | **Ánh xạ cột (column mapping):** PO chỉ cho tool biết cột nào của file ứng với trường nào; **lưu lại cấu hình ánh xạ** để lần sau dùng lại | ĐỀ XUẤT |
| A1b | **Xem trước** dữ liệu và báo lỗi theo từng dòng trước khi nhập | ĐỀ XUẤT |
| A1c | **Phát hiện trùng**: cùng ngôn ngữ + văn bản (+ loại từ) với concept đã có thì cho chọn bỏ qua, gộp thêm example, hoặc cập nhật | ĐỀ XUẤT |
| A1d | Lọc theo cột **bài/lesson** (nếu file có) để chỉ nạp một bài | ĐỀ XUẤT |
| A1e | **Tải file mẫu** (template CSV/XLSX) để PO hoặc công cụ ngoài xuất đúng định dạng | ĐỀ XUẤT |
| A3 | Màn hình duyệt danh sách ứng viên: thêm hoặc bỏ từng từ | CHỐT |
| A4 | Chọn nơi nạp: **ngôn ngữ** (Anh/Đức) và **chế độ** (Rộng/Sâu) | CHỐT |
| A5 | **Ghi nhanh thủ công** từ phim/sách: gõ **từ/cụm**, hoặc gõ/dán **cả câu rồi tô sáng cụm cần học** (C7); tùy chọn gợi ý tone. Tool bổ sung nghĩa/ví dụ (A8) và gợi ý TMRND (A9) sau, PO duyệt khi rảnh | CHỐT |
| A6 | Tự ẩn các concept đã `acquired` khỏi danh sách ứng viên ở bước duyệt (PO vẫn tự bỏ thủ công những từ chưa được tool ghi nhận) | ĐỀ XUẤT |
| A7 | **Chỉ lưu dữ liệu đã nhập**, không lưu file gốc | ĐỀ XUẤT |
| A8 | **Module tra cứu tự động**: bổ sung nghĩa, loại từ, giống/số nhiều, dạng chia động từ, ví dụ; kết quả luôn `unverified` (mục 6.5) | CHỐT |
| A9 | ~~AI gợi ý nhãn TMRND~~ **ĐÃ BỎ (v7).** PO gắn nhãn tay ở màn sửa example (M10a) | BỎ |

Ghi chú:
- PO chuẩn bị file danh sách từ bằng công cụ khác. Tool này không quan tâm file đó được tạo thế nào, chỉ cần đúng định dạng ở mục 6.4.
- PO ngại ghi chú lúc đang xem phim/đọc sách, nên A5 phải **cực nhanh, tối thiểu số thao tác**.

### B. Chọn ngôn ngữ, chế độ và kiểu bài
- B1. Chọn ngôn ngữ: Anh hoặc Đức.
- B2. Chọn chế độ lớn: Rộng hoặc Sâu.
- B3. Trong mỗi chế độ có **các kiểu bài** để chọn (xem mục 5).

### C. Dữ liệu từ vựng
- C1. Mỗi **concept** lưu: văn bản, loại từ, nghĩa, thông tin ngữ pháp (giống/số nhiều/dạng chia cho tiếng Đức), nguồn, trạng thái kiểm chứng, trạng thái thụ đắc.
- C2. Mỗi **example** (cụm/câu/đoạn) lưu: nội dung, phần được tô sáng (highlight) là concept đang học, và các thuộc tính **tone, mode, register, nuance, dialect**, cùng ô **Note**.
- C3. **Liên kết** concept – concept và example – concept, đầy đủ loại của PVO (mục 8). Liên kết tạo trong tool (file nhập ở bản đầu chưa mang liên kết, xem mục 9).
- C4. **Mỗi concept có ít nhất một example** [ĐỀ XUẤT]: nếu chưa có câu ví dụ, tool tự tạo example tối thiểu (chính văn bản của concept) để có đơn vị ôn tập; khi có câu thật thì thay hoặc bổ sung.
- C5. Phát âm tiếng Đức bằng giọng đọc có sẵn của trình duyệt/điện thoại (Web Speech API, `de-DE`). Chất lượng giọng tùy thiết bị. Bản sau có thể thử lấy file ghi âm từ Wiktionary nếu có (kiểm tra giấy phép từng file).
- C6. **Bộ từ điển (Dictionary)** để gom concept theo mục đích. **MVP: mỗi ngôn ngữ một bộ tự tạo** [ĐỀ XUẤT]; trường `dictionaryId` đã có sẵn nên thêm nhiều bộ sau này không cần đổi cấu trúc dữ liệu.

- C7. **Học cụm từ trong câu ví dụ bằng cách tô sáng (highlight)** **[CHỐT hướng, ĐỀ XUẤT chi tiết]:** khi PO nhập một câu nhưng chỉ muốn học **một cụm** trong đó, PO **tô sáng cụm đó**. Quy tắc:
  - **Cụm được tô sáng = concept cần học.** Phần còn lại của câu chỉ là **ngữ cảnh**, không bị kiểm tra.
  - Tool tạo concept mới từ cụm tô sáng, hoặc gắn vào một concept đã có (tìm bằng F3). Nếu cụm đã tồn tại, tool gợi ý gắn thay vì tạo trùng.
  - **Một example có một cụm tô sáng.** Muốn học thêm cụm thứ hai trong cùng câu, dùng nút **"Học thêm cụm khác trong câu này"** để tạo thêm một example (cùng câu, tô sáng cụm khác).
  - Bài tập lấy phần tô sáng làm mục tiêu: ví dụ che cụm đó trong câu để PO điền hoặc chọn, hoặc hiện cụm và hỏi nghĩa. Bài nghe chép tiếng Đức mặc định chép **cụm tô sáng**, có tùy chọn chép cả câu (mục 5).
  - Một câu **chưa chọn cụm** vẫn lưu được ở dạng **"câu chưa gắn concept"** (tương tự "undecided example" của PVO), nằm trong Hộp chờ duyệt để tô sáng sau.
  - Cho phép tô sáng **cả câu** (concept là cả câu, dùng cho câu cố định hoặc idiom).

### D. Theo dõi và ôn tập
- D1. Ghi lại mỗi câu trả lời: đúng/sai, **thời gian phản xạ**, kiểu bài, example đã dùng.
- D2. Tính trạng thái concept theo tiêu chí ở mục 2.
- D3. **Ôn tập đa dạng, tránh nhàm** **[ĐỀ XUẤT]**:
  - Xáo trộn kiểu bài mỗi lần gặp lại.
  - Mỗi lần dùng example khác nhau của cùng concept.
  - Vòng **phản xạ chớp nhoáng** có bấm giờ (rèn thụ đắc).
  - Thỉnh thoảng sinh đoạn văn ngắn trộn các từ yếu.
- D4. **Lịch ôn lặp lại ngắt quãng tính theo example** [CHỐT]: mỗi example có lịch riêng (ngày đến hạn, khoảng cách ôn…). Thuật toán cụ thể **[MỞ]**; bắt đầu bằng thuật toán đơn giản (kiểu SM-2) và để thay thế được bằng module, ví dụ chuyển sang thuật toán mới hơn nếu có thư viện miễn phí phù hợp (kiểm tra giấy phép khi triển khai).

### E. Hệ thống
- E1. Ứng dụng web cài được lên màn hình chính điện thoại (PWA).
- E2. Dữ liệu lưu cục bộ, có **nút sao lưu**.
- E3. **Xuất/nhập JSON** (đầy đủ) và **xuất xlsx** (để lưu trữ, đọc). **Cột của file xuất trùng với cột của file mẫu nhập (A1e)** để xuất rồi nhập lại được [ĐỀ XUẤT].
- E4. **Đồng bộ tự động giữa các thiết bị [CHỐT]** (mục 6.3).
- E5. Màn hình xem concept theo **cấu trúc cây/bảng** (cảm hứng từ Tree của PVO). Danh sách thụt lề là đủ, đồ thị trực quan để sau.

### F. Tìm kiếm **[CHỐT chức năng, ĐỀ XUẤT chi tiết]**
| # | Chức năng | Trạng thái |
|---|---|---|
| F1 | **Ô tìm kiếm toàn cục** trên màn hình Hôm nay và Thư viện: tìm trong văn bản concept, nghĩa, câu ví dụ, ghi chú | CHỐT |
| F2 | **Bộ lọc** kết hợp với từ khóa: ngôn ngữ, trạng thái (`loaded`/`acquired`), độ kiểm chứng, từng thuộc tính TMRND, bài (lesson), nguồn, "câu chưa gắn concept", loại liên kết; có sắp xếp | ĐỀ XUẤT |
| F3 | **Tìm khi chọn:** dùng cùng bộ tìm kiếm khi chọn concept để gắn với cụm tô sáng, khi tạo liên kết concept – concept hoặc example – concept, và khi xử lý từ trùng lúc nhập file. Nếu không có kết quả thì cho **thêm nhanh ngay từ ô tìm** (giống PVO) | ĐỀ XUẤT |
| F4 | **Chuẩn hóa khi tìm:** không phân biệt hoa/thường; bỏ dấu tiếng Việt khi tìm trong nghĩa; tiếng Đức coi `ä/ae`, `ö/oe`, `ü/ue`, `ß/ss` là tương đương | ĐỀ XUẤT |
| F5 | Tìm khoan dung lỗi gõ (fuzzy) và tìm theo cách phát âm (tương tự "Soundex search" tùy chọn của PVO) | MỞ, làm sau |

Tìm kiếm chạy **hoàn toàn cục bộ, kể cả khi không có mạng**, và phải nhanh khi có hàng nghìn từ.

---

## 5. Kiểu bài theo ngôn ngữ và chế độ

### 5.1 Tiếng Đức (A1–A2): chỉ chế độ Rộng **[CHỐT]**
Bài tập đơn giản, tập trung chính tả và hình thái từ:
- **Nghe chép chính tả:** phát âm từ, người học gõ đúng chính tả.
- **Danh từ:** điền đúng **giống (der/die/das)** và **số nhiều**.
- **Động từ:** chia đúng theo ngôi/thì.
- **Động từ bất quy tắc:** điền các dạng (Infinitiv, Präteritum, Partizip II...).
- Khi học danh từ luôn học kèm **giống và số nhiều**.
- **Khi example có cụm tô sáng (C7):** nghe chép mặc định chép **cụm tô sáng**; có tùy chọn chép cả câu.

### 5.2 Tiếng Anh: Rộng và Sâu

**Chế độ Rộng [CHỐT]:**
- **Danh từ:** học từ đơn, sau đó ghép vào câu/ngữ cảnh.
- **Động từ:** học theo **cụm** (collocation/phrasal), sau đó ghép vào ngữ cảnh.
- Lý do: tránh học rời rạc cả danh từ lẫn động từ theo cùng một kiểu.
- **Cụm tô sáng là mục tiêu kiểm tra** (C7); phần còn lại của câu chỉ là ngữ cảnh. Bài điền che đúng cụm tô sáng.
- **Kiểu bài tiếng Anh Rộng [ĐỀ XUẤT, chốt ở M9b]:**
  - `en.cloze`: che đúng cụm tô sáng trong câu, người học gõ lại cụm đó (cả danh từ và động từ).
  - `en.meaning-to-word`: cho nghĩa, gõ từ (danh từ đơn).
  - `en.word-to-meaning`: cho từ/cụm, chọn nghĩa trong 4 lựa chọn; 3 nghĩa nhiễu lấy từ các concept khác đã `verified` (cụm động từ).
  - `en.dictation` (tùy chọn): nghe và gõ, dùng giọng đọc `en-US`/`en-GB` có sẵn.
- **Chấm tiếng Anh [ĐỀ XUẤT]:** không phân biệt hoa/thường (tiếng Anh không viết hoa danh từ như tiếng Đức); vẫn chính xác từng ký tự, chỉ bỏ khoảng trắng thừa.
- **Chỉ concept đã `verified` mới vào bài nghĩa/từ** (nguyên tắc 8): nghĩa tra cứu bằng tiếng Anh chưa được PO sửa sang tiếng Việt khi duyệt thì chưa dùng làm đáp án.
- Danh từ/động từ phân theo `pos` của concept; từ chưa có `pos` vẫn làm được `en.cloze`.

**Chế độ Sâu [CHỐT hướng, ĐỀ XUẤT chi tiết bài tập]:**
Học concept qua các **example** có thuộc tính ngữ cảnh và qua **liên kết** giữa các concept, dùng đầy đủ mô hình PVO (mục 1.3).
- **Ví dụ concept "chào hỏi":** các example *Hello*, *Hi*, *Greetings* cùng liên kết tới concept chào hỏi, mỗi example có tone khác nhau.
- Kiểu bài:
  - **S1. Gắn nhãn:** hiển thị một example, người học chọn thuộc tính (tone, mode, register, nuance, dialect; số thuộc tính hỏi mỗi lần là cấu hình). Chấm theo nhãn đã `verified`.
  - **S2. Chọn từ hợp ngữ cảnh:** cho một tình huống/đoạn văn có tone/mode xác định, người học chọn example hoặc concept phù hợp nhất trong nhóm cùng liên kết (ví dụ cùng concept cha).
  - **S3. Nhớ liên kết** (làm sau): cho một concept, người học nhớ lại các concept/example liên kết với nó.
- **Collocation và idiom [CHỐT]:** biểu diễn bằng loại liên kết example – concept (*Idiom*, *Other phrase*... trong bộ đầy đủ của PVO).
- Đức Sâu (ví dụ *Moin/Servus/Grüß Gott*: khác nhau theo tone và dialect) là hướng mở rộng sau khi PO lên trình độ cao hơn, **không thuộc các bản đầu**.

---

## 6. Tech stack

### 6.1 Đề xuất **[ĐỀ XUẤT]**
| Mục đích | Công nghệ |
|---|---|
| Ngôn ngữ/UI | TypeScript, React, Vite |
| Ứng dụng cài được | PWA (service worker, manifest) |
| Lưu dữ liệu cục bộ | IndexedDB (thư viện Dexie) |
| Nhập/xuất XLSX và CSV | SheetJS (`xlsx`) đọc được cả hai định dạng; có thể thêm thư viện CSV riêng nếu cần |
| Đồng bộ | Firebase gói Spark: Authentication (email hoặc Google) + Firestore (mục 6.3) |
| Tra cứu từ điển | Free Dictionary API (tiếng Anh), Wiktionary qua Wikimedia REST API (tiếng Đức) (mục 6.5) |
| AI gợi ý nhãn TMRND | **Đã bỏ (v7)**, xem mục 6.6 |
| Tìm kiếm cục bộ | Thư viện tìm kiếm chạy trong trình duyệt (ví dụ MiniSearch hoặc FlexSearch) hoặc truy vấn Dexie; kiểm tra giấy phép (mục 6.7) |
| Phát âm | Web Speech API (`speechSynthesis`, voice `de-DE`) |
| Hosting | Web tĩnh miễn phí (ví dụ GitHub Pages hoặc Firebase Hosting) |

Claude Code có thể đề xuất thay thế nếu có lý do kỹ thuật rõ ràng, miễn giữ đúng nguyên tắc ở mục 3. Kiểm tra lại giấy phép, điều khoản và phiên bản mới nhất của từng thư viện/dịch vụ trước khi dùng.

### 6.2 Kiến trúc dữ liệu
- Local-first: IndexedDB là nguồn dữ liệu chính của từng thiết bị.
- Mọi thao tác dữ liệu đi qua một **lớp repository**.
- Dữ liệu có `schemaVersion` và cơ chế **migration**: nâng cấp cấu trúc không làm mất từ đã học.
- Mọi bản ghi có `updatedAt` và cờ xóa mềm `deletedAt` (để đồng bộ xử lý việc xóa).

### 6.3 Đồng bộ tự động **[CHỐT chức năng, ĐỀ XUẤT cách làm]**
- PO muốn dữ liệu tự đồng bộ giữa điện thoại và máy tính. Dùng **Firebase gói Spark** (miễn phí, không cần thẻ): Authentication + Firestore. Hạn mức tham khảo (kiểm tra năm 2026, cần kiểm lại khi triển khai): khoảng 1 GiB dữ liệu, 50.000 lượt đọc/ngày, 20.000 lượt ghi/ngày, 50.000 người dùng đăng nhập hằng tháng. Vượt hạn mức thì dịch vụ dừng chứ không tính tiền. Dữ liệu từ vựng là chữ nên với một người dùng gần như không chạm hạn mức; vẫn nên gộp ghi theo lô (đặc biệt khi nhập hàng trăm từ một lần) để tiết kiệm lượt ghi.
- **Local-first vẫn là nguyên tắc:** app đọc/ghi IndexedDB trước, lớp đồng bộ chạy nền, đẩy thay đổi lên và kéo thay đổi về khi có mạng. App vẫn dùng được trọn vẹn khi mất mạng hoặc khi dịch vụ đồng bộ ngừng.
- Xử lý xung đột: **bản ghi nào có `updatedAt` mới hơn thắng** (theo từng bản ghi); `ReviewLog` chỉ thêm mới nên không xung đột.
- Bảo mật: đăng nhập bằng email hoặc Google; **không dùng phone authentication** (tốn phí SMS). Viết **Security Rules** để mỗi người chỉ đọc/ghi dữ liệu của chính mình.
- **Không dùng Firebase Cloud Storage** (từ 2/2026 yêu cầu gói trả phí); app chỉ lưu chữ.
- Đồng bộ nằm sau giao diện `SyncAdapter` để đổi nhà cung cấp được (Supabase Free là phương án thay thế, nhưng dự án bị tạm dừng sau khoảng một tuần không hoạt động, bất tiện cho người học không đều).
- Xuất/nhập JSON vẫn giữ làm phương án sao lưu độc lập với dịch vụ đồng bộ.

### 6.4 Nhập từ file CSV/XLSX **[CHỐT chức năng, ĐỀ XUẤT chi tiết]**

**Nguyên tắc:** mỗi **dòng = một concept** (kèm tối đa một example). Muốn gắn thêm example cho cùng concept thì thêm dòng mới có cùng văn bản concept; tool gộp nhờ cơ chế phát hiện trùng (A1c).

**Các cột hỗ trợ.** Chỉ `text` là bắt buộc; mọi cột khác tùy chọn. Tên cột trong file của PO có thể khác, ánh xạ ở A1a:

| Cột | Ý nghĩa | Ghi chú |
|---|---|---|
| `text` | Từ/cụm từ (concept) | **Bắt buộc** |
| `lang` | `en` hoặc `de` | Nếu thiếu, PO chọn ngôn ngữ cho cả file khi nhập (A4) |
| `pos` | Loại từ | noun, verb, adj... |
| `meaning` | Nghĩa | Có thể nhiều nghĩa, phân tách bằng ký hiệu thống nhất (ví dụ `;`) |
| `lesson` | Bài/chương nguồn | Dùng để lọc ở A1d |
| `example` | Câu/cụm ví dụ chứa concept | Tạo một Example gắn với concept. Tool **tự tìm `text` bên trong `example`** (không phân biệt hoa/thường) để đặt **phần tô sáng**; nếu không thấy (ví dụ câu dùng dạng biến thể như *swallowed* so với *swallow*), đánh dấu để PO tô sáng tay ở bước duyệt |
| `highlight` | Đoạn chính xác trong `example` cần tô sáng | Tùy chọn; dùng khi dạng xuất hiện trong câu khác với `text` |
| `gender` | Giống danh từ tiếng Đức | `der/die/das` hoặc `m/f/n`; tool chuẩn hóa |
| `plural` | Dạng số nhiều tiếng Đức | |
| `infinitiv`, `praeteritum`, `partizip2` | Các dạng động từ tiếng Đức | Dùng cho bài động từ bất quy tắc |
| `tone`, `mode`, `register`, `nuance`, `dialect` | Thuộc tính của example | Giá trị phải khớp bộ mặc định PVO (mục 1.3); giá trị lạ bị đánh dấu lỗi để PO sửa, không tự thêm |
| `note` | Ghi chú của example | Ví dụ ghi "slang" ở đây |

**Quy tắc xử lý:**
- Hỗ trợ CSV với dấu phân cách phẩy, chấm phẩy hoặc tab (tự nhận diện) và mã hóa **UTF-8 (có hoặc không có BOM)**; kiểm tra ký tự đặc biệt tiếng Đức (ä, ö, ü, ß) hiển thị đúng ở bước xem trước. XLSX: đọc sheet đầu tiên, cho phép chọn sheet khác.
- Chuẩn hóa: cắt khoảng trắng thừa, chuẩn hóa Unicode về dạng NFC, **giữ nguyên chữ hoa** (danh từ tiếng Đức viết hoa).
- Dòng trống hoặc thiếu `text` bị bỏ qua và báo số dòng.
- Xem trước và báo lỗi (A1b) trước khi ghi dữ liệu; nhập theo lô, có thể hoàn tác lần nhập gần nhất [ĐỀ XUẤT].
- File lớn được xử lý trong Web Worker để không đơ giao diện.
- Tool cung cấp **file mẫu** (A1e) với đúng các cột trên; file xuất xlsx dùng cùng bộ cột (E3).
- Sau khi nhập, dữ liệu đi qua màn hình duyệt (A3), chọn nơi nạp (A4), và ẩn từ đã thụ đắc (A6).

### 6.5 Module tra cứu tự động **[CHỐT chức năng, ĐỀ XUẤT nguồn]**
- Mục đích: sau khi có danh sách từ (nhập từ file hoặc ghi nhanh), tự gợi ý nghĩa, loại từ, giống/số nhiều, dạng chia động từ, câu ví dụ, và thuộc tính đề xuất; PO duyệt.
- **Tiếng Anh:** Free Dictionary API (HUST PVO cũng dùng làm nguồn tham khảo). Kiểm tra điều khoản và hạn mức khi triển khai.
- **Tiếng Đức:** Wiktionary qua REST API của Wikimedia (miễn phí, có điều khoản và giới hạn tần suất riêng, cần tuân thủ). Mục từ tiếng Đức chứa giống danh từ và dạng chia động từ nhưng ở dạng wikitext, **cần tự phân tích (parse)**. Kiểm tra CORS và giới hạn tần suất khi triển khai.
- Chỉ gửi **từ đơn lẻ** tới dịch vụ tra cứu, không gửi nội dung nào khác. Tra cứu hàng loạt phải **giãn nhịp** để tuân thủ giới hạn tần suất và chạy nền.
- Giao diện `LookupProvider`, mỗi ngôn ngữ một nhà cung cấp, thay được. Mọi kết quả là `unverified`.
- Không có AI trong tool. Nếu nguồn từ điển có sẵn nhãn (ví dụ thẻ informal, slang, dated), module tra cứu hiển thị nhãn đó làm **bằng chứng tham khảo** cho PO tự gắn nhãn.

### 6.6 AI gợi ý nhãn TMRND **[ĐÃ BỎ, v7]**
- PO đã triển khai thử (M10b, Gemini gói miễn phí) và quyết định **bỏ** vì lời gọi không phản hồi sau hơn 1 phút; PO gắn nhãn TMRND bằng tay ở màn sửa example (M10a).
- Toàn bộ mã `src/ai/`, màn `/labels` và mục AI trong Cài đặt đã bị xóa. Khóa API còn trên thiết bị được xóa khi mở app.
- Dữ liệu cũ vẫn được giữ để không mất (nguyên tắc nâng cấp): `Example.suggestedAttributes`, `attributesStatus = suggested` và `Settings.aiProviderConfig` còn trong mô hình nhưng không còn code nào ghi hoặc hiển thị chúng; `suggested` không bao giờ là đáp án chấm điểm.
- Muốn thêm lại sau này: cần quyết định mới của PO và nhà cung cấp phản hồi ổn định; ghi vào mục 9.2.

### 6.7 Tìm kiếm cục bộ **[ĐỀ XUẤT]**
- Chỉ mục tìm kiếm là **dữ liệu dẫn xuất** (dựng lại từ IndexedDB), **không đồng bộ**; dựng lại khi mở app trên thiết bị mới hoặc sau khi nhập file lớn, cập nhật tăng dần khi thêm/sửa/xóa.
- Trường được lập chỉ mục: văn bản concept, nghĩa, văn bản example, note, nguồn/lesson. Thuộc tính TMRND và trạng thái dùng làm bộ lọc.
- Chuẩn hóa theo F4 khi lập chỉ mục và khi truy vấn.
- Phản hồi tức thì với vài nghìn từ trên điện thoại.
- Dùng thư viện tìm kiếm chạy trong trình duyệt hoặc truy vấn Dexie, miễn là miễn phí và chạy được offline; nằm sau giao diện `SearchService` để thay được.

---

## 7. Kiến trúc module (yêu cầu linh hoạt) **[CHỐT]**

Lõi nhỏ cộng các module độc lập, mỗi chức năng thêm/bớt/đổi không ảnh hưởng module khác.

- **Kiểu bài = module.** Cùng một giao diện chung, ví dụ (minh họa):
  ```ts
  interface ExerciseModule {
    id: string;                       // "de.dictation", "de.noun-gender-plural", "en.depth.label", ...
    languages: string[];              // ["de"], ["en"]
    mode: "breadth" | "depth";
    generate(example: Example, concept: Concept, ctx: Context): Exercise;
    grade(answer: unknown, exercise: Exercise): { correct: boolean };
    // thời gian phản xạ do lõi đo, không do module
  }
  ```
- **Nguồn từ = module** (`file-import` cho CSV/XLSX, `quick-add`...), cùng giao diện trả về danh sách từ ứng viên. Muốn thêm nguồn mới (ví dụ đọc PDF sau này) chỉ cần viết thêm một module nguồn.
- **`LookupProvider`**: tra cứu theo ngôn ngữ (mục 6.5).
- **`SyncAdapter`**: đồng bộ dữ liệu (mục 6.3).
- **`SearchService`**: tìm kiếm cục bộ (mục 6.7).
- **Ngôn ngữ = gói cấu hình** (Anh, Đức). Thêm ngôn ngữ mới không đụng lõi.
- **Thuộc tính ngữ cảnh = cấu hình/dữ liệu** (tone, mode, register, nuance, dialect và tập giá trị). Thêm thuộc tính hoặc giá trị không cần sửa code.
- **Loại liên kết = cấu hình** (concept – concept, example – concept).
- **Tiêu chí thụ đắc = cấu hình** (mục 2).
- **Cấu hình ánh xạ cột khi nhập = dữ liệu** lưu lại được (A1a).
- **Thuật toán ôn tập = module thay thế được** (đơn vị lập lịch là example).
- **Đăng ký module bằng registry**, không import cứng lẫn nhau.

---

## 8. Mô hình dữ liệu (phác thảo, theo mô hình PVO ở mục 1.3)

```
Dictionary {
  id, name, lang                       // MVP: một bộ tự tạo mỗi ngôn ngữ
}

Concept {                              // một từ, cụm từ hoặc nhóm từ đại diện cho một nghĩa
  id, dictionaryId, lang ("en"|"de"),
  text, pos,
  meanings[],
  grammar?: {                          // tiếng Đức
    gender?, plural?, verbForms?       // Infinitiv, Präteritum, Partizip II...
  },
  verification: "unverified" | "verified",
  source: { type ("import"|"quick-add"|"lookup"), fileName?, lesson?, row? },
  status: "unknown" | "loaded" | "acquired",
  createdAt, updatedAt, deletedAt?
}

Example {                              // câu/cụm/đoạn thể hiện cách dùng
  id, dictionaryId, text,
  targetConceptId?,                    // concept của cụm tô sáng; rỗng = "câu chưa gắn concept"
  highlight?: { start, end },          // cụm cần học (một cụm mỗi example); phần còn lại là ngữ cảnh
  attributes: {                        // TMRND đã được PO chấp nhận; giá trị lấy từ bộ mặc định PVO
    tone, mode, register, nuance, dialect
  },
  attributesStatus: "empty" | "suggested" | "verified",
  suggestedAttributes?: {              // LEGACY (đã bỏ AI, v7): giữ để không mất dữ liệu, không ghi mới
    tone?, mode?, register?, nuance?, dialect?,   // mỗi mục: { value, reason, confidence? }
    provider, suggestedAt
  },
  note?,                               // ví dụ ghi "slang" ở đây
  verification: "unverified" | "verified",   // độ tin cậy của nội dung, nghĩa
  isMinimal?: boolean,                 // example tự tạo từ chính concept
  createdAt, updatedAt, deletedAt?
}

ConceptLink {                          // concept – concept
  id, childId, parentId,
  type: "association" | "typeOf",
  updatedAt, deletedAt?
}                                      // ràng buộc: không tạo vòng tròn (kiểm tra khi lưu)

ExampleLink {                          // example – concept (liên kết ngữ nghĩa thêm); dùng đầy đủ bộ PVO
  id, exampleId, conceptId,
  type: "idiom" | "nominal" | "agent" | "patient" | "action"
      | "describedBy" | "describing" | "otherPhrase",
  updatedAt, deletedAt?
}

ScheduleState {                        // lịch ôn tính theo example
  exampleId, due, intervalDays, ease/stability?, lapses, updatedAt
}                                      // trường cụ thể phụ thuộc thuật toán được chọn

ReviewLog {                            // chỉ thêm mới
  id, conceptId, exampleId, exerciseType,
  correct, responseTimeMs, timestamp
}

ImportMapping {                        // cấu hình ánh xạ cột đã lưu
  id, name, columns: { [fileColumn]: fieldName }, delimiter?, sheet?
}

Settings {
  acquisitionCriteria,
  attributeValueSets,                  // bộ mặc định PVO
  linkTypes,
  enabledModules,
  aiProviderConfig,                    // LEGACY (đã bỏ AI, v7), không còn dùng
  schemaVersion
}

LocalSecrets {                         // LEGACY (đã bỏ AI, v7)
  aiApiKey
}

SearchIndex                            // dữ liệu dẫn xuất, dựng lại từ dữ liệu gốc, KHÔNG đồng bộ
```

Ghi chú:
- Thuộc tính TMRND gắn vào **Example**, không gắn vào Concept.
- `targetConceptId` + `highlight` thể hiện cụm cần học trong câu (C7). `ExampleLink` dành cho các quan hệ ngữ nghĩa bổ sung theo bộ PVO.
- **Lịch ôn và ReviewLog tính theo example.** Câu chưa gắn concept (không có `targetConceptId`) chưa có lịch ôn.
- Ở chế độ Rộng, concept kèm một example (kể cả example tối thiểu) là đủ. Liên kết và TMRND chủ yếu dùng ở chế độ Sâu.
- Ở bản đầu, mạng liên kết chỉ cần thể hiện dạng **bảng/cây thụt lề**, chưa cần đồ thị trực quan.

---

## 9. Nhật ký quyết định và câu hỏi còn mở

### 9.1 Đã chốt
| Vấn đề | Quyết định |
|---|---|
| Đọc PDF / quét trang | **Bỏ khỏi tool.** PO dùng công cụ ngoài, nhập vào tool bằng CSV/XLSX |
| AI | **Bỏ khỏi tool (v7)**: PO gắn nhãn TMRND bằng tay |
| Tìm kiếm | **Cần** (mục F, 6.7) |
| Học cụm trong câu ví dụ | **Tô sáng cụm cần học**; phần còn lại là ngữ cảnh (C7) |
| Thuật ngữ | **TMRND** = Tone, Mode, Register, Nuance, Dialect |
| Đồng bộ thiết bị | **Tự động** (mục 6.3) |
| Module tra cứu tự động | **Cần** (mục 6.5, A8) |
| Tập giá trị thuộc tính | **Dùng bộ mặc định của PVO**; nhãn như slang ghi vào ô Note |
| Loại liên kết | **Dùng đầy đủ bộ của PVO** |
| Collocation/idiom | Biểu diễn bằng loại liên kết example – concept |
| Đơn vị ôn tập (spaced repetition) | **Theo example** |
| "Nạp vào tiếng Việt" | Là gõ nhầm, ý đúng là **"nạp vào tiếng Đức"** |

### 9.2 Còn mở
1. ~~Gửi câu ví dụ tới AI~~ **Không còn áp dụng (v7: đã bỏ AI).**
2. **Quy tắc tô sáng (C7):** "một example một cụm tô sáng, muốn thêm cụm thì tạo example mới" có ổn không, hay PO muốn một câu mang nhiều cụm cùng lúc?
3. **Định dạng file nhập:** công cụ ngoài của PO xuất ra những cột nào? Cần vài dòng đầu của file thật để chốt bộ cột ở mục 6.4.
4. **Liên kết trong file nhập:** có cần nhập liên kết concept/example từ file không? **[ĐỀ XUẤT]** bản đầu chưa nhập liên kết từ file.
5. **Thuật toán spaced repetition** (đơn vị là example): kiểu SM-2 đơn giản hay mới hơn?
6. **Bộ từ điển (Dictionary):** đang **mặc định mỗi ngôn ngữ một bộ tự tạo** (C6). PO xác nhận hoặc yêu cầu nhiều bộ ngay từ MVP.
7. ~~Ngưỡng chấp nhận chất lượng gợi ý AI~~ **Không còn áp dụng (v7).**
8. **Chi tiết kỹ thuật cần kiểm khi triển khai (không cần PO quyết):** CORS và hạn mức khi gọi Free Dictionary API, Wikimedia API, Gemini API từ trình duyệt; cách phân tích mục từ tiếng Đức của Wiktionary; thư viện tìm kiếm.

---

## 10. Lộ trình và cột mốc

Mỗi phiên làm việc với Claude Code chỉ nên giao **một cột mốc**, dùng mục "Xong khi" làm tiêu chí nghiệm thu.

### Bản 1 (MVP): Tiếng Đức, chế độ Rộng **[ĐỀ XUẤT]**

| Mốc | Nội dung | Xong khi |
|---|---|---|
| **M0** Khởi tạo | Repo, Vite + React + TS, khung PWA, triển khai hosting miễn phí. Đưa spec vào repo, viết `CLAUDE.md` tóm tắt các nguyên tắc cứng (miễn phí, local-first, module, không hard-code, không sao chép mã PVO) | Mở được link trên điện thoại và cài lên màn hình chính |
| **M1** Lõi dữ liệu | Dexie/IndexedDB, repository, `schemaVersion` và migration, các model ở mục 8 (ít nhất Concept, Example, ReviewLog, ScheduleState, ImportMapping, Settings), registry module, cấu hình tiêu chí thụ đắc | Test tự động cho thêm/sửa/xóa (xóa mềm) và một lần migration thử |
| **M2** Quản lý từ | Màn hình thêm từ, ghi nhanh (A5) gồm cả **gõ câu rồi tô sáng cụm** (C7), Hộp chờ duyệt cho câu chưa gắn concept, danh sách, sửa, xóa, gán ngôn ngữ/chế độ, example tối thiểu (C4) | Thêm được một từ trong khoảng 2 thao tác trên điện thoại; nhập một câu, tô sáng một cụm, ra đúng concept gắn với câu |
| **M2b** Tìm kiếm | `SearchService`: chỉ mục cục bộ, ô tìm toàn cục, bộ lọc, chuẩn hóa (F1–F4), tìm khi chọn concept (F3) | Gõ vài ký tự ra kết quả tức thì kể cả offline; tìm "aepfel" thấy "Äpfel" |
| **M3** Nhập từ CSV/XLSX | Module `file-import`: đọc CSV/XLSX, ánh xạ cột (lưu được), xem trước và báo lỗi, phát hiện trùng, lọc theo bài, màn hình duyệt thêm/bớt, chọn nơi nạp (ngôn ngữ, chế độ), file mẫu | Nhập một file thật (có ä, ö, ü, ß) vào và lưu được danh sách đúng; nhập lại cùng file không tạo trùng |
| **M3b** Tra cứu tự động | `LookupProvider` tiếng Anh (Free Dictionary API) và tiếng Đức (Wiktionary), điền gợi ý nghĩa/giống/số nhiều/dạng chia, đánh dấu `unverified`, tra cứu giãn nhịp, màn hình duyệt | Chọn một từ, nhận gợi ý, duyệt thành `verified` |
| **M4** Bài tiếng Đức | Bộ chạy bài dùng chung, lõi đo thời gian phản xạ, bốn module: nghe chép chính tả, giống + số nhiều, chia động từ, động từ bất quy tắc, phát âm bằng giọng đọc có sẵn | Chơi được từng kiểu bài, chấm đúng/sai, ghi được thời gian |
| **M5** Thụ đắc | Ghi ReviewLog, tính `unknown → loaded → acquired`, tự ẩn concept đã thụ đắc khỏi danh sách duyệt | Test mô phỏng nhiều lượt cho thấy trạng thái chuyển đúng |
| **M6** Ôn tập theo example | Lập lịch theo example (ScheduleState), xáo kiểu bài, đổi example, phản xạ chớp nhoáng có bấm giờ; thuật toán là module thay được | Cùng một concept lần sau gặp lại bằng example/kiểu bài khác theo lịch |
| **M7** Xuất/nhập | Xuất/nhập JSON, xuất xlsx (cùng bộ cột với file mẫu), nút sao lưu | Xuất ở máy này, nhập ở máy kia, dữ liệu đầy đủ; xuất xlsx rồi nhập lại được |
| **M7b** Đồng bộ tự động | Firebase Spark (Auth + Firestore), `SyncAdapter`, Security Rules, xung đột theo `updatedAt`, xóa mềm | Học trên điện thoại, mở máy tính thấy dữ liệu mới mà không thao tác; hoạt động cả khi mất mạng rồi có mạng lại |
| **M8** Dùng thật | PO học 1–2 tuần, ghi chỗ bất tiện, chỉnh ngưỡng thụ đắc và giao diện | Có danh sách chỉnh sửa dựa trên dữ liệu dùng thật |

### Bản 2: Tiếng Anh, chế độ Rộng
- Danh từ đơn → câu; động từ theo cụm → ngữ cảnh. Bài điền che cụm tô sáng.
- Tái dùng bộ máy ôn tập và lịch theo example từ Bản 1.
- Bản 2 chia thành các mốc dưới đây (mỗi phiên một mốc, làm theo thứ tự M9a → M9b → M9c → M10a → M10b):

| Mốc | Nội dung | Xong khi |
|---|---|---|
| **M9a** Tổng quát hóa | Mỗi `ExerciseModule` tự khai báo giọng đọc (`speechLang`), ngôn ngữ ô nhập (`inputLang`) và phím đặc biệt (`specialKeys`); màn Học và màn làm bài đọc các khai báo này thay vì gắn cứng `de-DE`/ä ö ü ß/`de.dictation` | Bài tiếng Đức chạy y như cũ, mọi test cũ vẫn đạt |
| **M9b** Bài tiếng Anh Rộng | Các module `en.*` ở mục 5.2, phân loại danh từ/động từ theo `pos`, chỉ dùng concept `verified` cho bài nghĩa/từ | Chơi được từng kiểu bài, chấm đúng, ghi thời gian vào ReviewLog; ôn tập và chớp nhoáng trộn được bài Anh; bài điền chỉ che cụm tô sáng |
| **M9c** Cài đặt học | Màn Cài đặt chỉnh ngưỡng thụ đắc (`acquisitionCriteria`) và số câu mỗi phiên; chốt giá trị mặc định `minDistinctContexts` (từ chỉ có 1 example tối thiểu hiện không thể `acquired`) | Đổi ngưỡng thì trạng thái thụ đắc tính theo ngưỡng mới |
| **M10a** Sửa example | Màn sửa example: tô sáng lại cụm, chọn 5 nhãn TMRND bằng tay, ghi chú, nút "Học thêm cụm khác trong câu này" (J10) | Gắn nhãn tay được; nhãn đã duyệt lưu `verified`; nhãn chưa duyệt không dùng làm đáp án |
| **M10b** ~~AI gợi ý TMRND~~ | **ĐÃ LÀM RỒI BỎ (v7)**: mã AI đã xóa, PO gắn nhãn tay | Không còn áp dụng |

- **M10 AI gợi ý TMRND:** đã bỏ ở v7 (mục 6.6). Bản 2 kết thúc ở M10a.

### Bản 3: Tiếng Anh, chế độ Sâu (kế hoạch v8, PO đã đồng ý)
Mục tiêu: **quản lý và tra cứu kho từ** theo tri-fold (mục 1.4); bài tập là phụ. Concept chế độ Sâu là một **ý**; các example là cách diễn đạt khác nhau của ý đó.

| Mốc | Nội dung | Xong khi |
|---|---|---|
| **M11a** Concept Sâu + cách diễn đạt | Tạo concept Sâu (tên gõ tự do + mô tả tiếng Việt); thêm example làm cách diễn đạt (concept chủ = concept đó), gắn nhãn tay (dùng màn M10a); nối một example vào concept khác bằng `ExampleLink` (bảng mới, Dexie v4); chỉ báo "x/N cách diễn đạt" và ngưỡng N trong Cài đặt | Tạo "số lượng nhiều", thêm *a lot of / a bunch of / a great deal of* với nhãn khác nhau, thấy 3/3; chưa gắn nhãn thì chưa tính |
| **M11b** Màn xem concept kiểu kho | Mở concept thấy các cách diễn đạt kèm nhãn, gom theo Tone/Register; tìm theo ý | Tìm "số lượng" ra concept và các cách nói |
| **M11c** Liên kết concept–concept + cây | `ConceptLink` (*Association*, *Type of*, con → cha), chặn vòng tròn, màn cây thụt lề (E5) | A→B→C tạo được, C→A bị chặn |
| **M11d** Bài S2 | Cho tình huống có tone/mode xác định, chọn cách diễn đạt hợp nhất trong nhóm cùng concept | Nhóm dưới 2 cách thì bỏ qua và nhắc thêm |
| **M11e** Bài S1 | Hiện một cách diễn đạt, chọn thuộc tính; chấm theo nhãn `verified` | Chỉ example có nhãn `verified` vào bài |

- Chưa nhập liên kết từ file (PO giữ đề xuất). S3 (nhớ liên kết) làm sau.
- Bài S1/S2 chỉ ghi log và lịch ôn theo example, **chưa** ảnh hưởng trạng thái `acquired` của concept (chờ dữ liệu dùng thật).

### Về sau
Đồ thị trực quan, mở rộng chiều sâu cho tiếng Đức, nhiều bộ từ điển, ghi âm từ Wiktionary, các module nguồn từ mới nếu cần.

---

## 11. Lưu ý quan trọng cho người triển khai

- **Miễn phí là ràng buộc cứng.** Trước khi thêm bất kỳ dịch vụ/API nào, phải xác nhận có gói miễn phí vĩnh viễn và không tự động tính tiền khi vượt hạn mức. Mọi dịch vụ ngoài phải thất bại êm.
- **Giá, hạn mức, điều khoản của dịch vụ thay đổi theo thời gian;** luôn kiểm tra lại trang chính thức trước khi dựa vào con số nào.
- **Không sao chép mã nguồn PVO/HUST PVO.** Chỉ dùng mô hình khái niệm từ tài liệu công khai.
- **Không đọc PDF, không OCR trong tool.** Dữ liệu vào bằng CSV/XLSX hoặc ghi nhanh. **Tool không dùng AI** (v7); nhãn TMRND do PO gắn tay.
- **Thuộc tính ngữ cảnh gắn vào Example**, không gắn vào Concept. Tone = mức trang trọng, Register = lĩnh vực.
- **Lịch ôn tính theo example.** Mỗi concept phải có ít nhất một example (kể cả example tối thiểu).
- **Nhập file phải an toàn và lặp lại được:** xem trước trước khi ghi, báo lỗi theo dòng, phát hiện trùng, nhập lại cùng file không được tạo bản sao. Đặc biệt kiểm tra mã hóa và ký tự đặc biệt tiếng Đức.
- **Dữ liệu người dùng không được mất khi nâng cấp:** mọi thay đổi cấu trúc phải đi kèm migration; xóa dùng xóa mềm để đồng bộ đúng.
- **Không hard-code** ngôn ngữ, thuộc tính và tập giá trị, loại liên kết, tiêu chí thụ đắc, danh sách kiểu bài, tên cột nhập.
- **Dữ liệu tra cứu chỉ là gợi ý** (`unverified`); PO phải duyệt thì mới thành dữ liệu chính thức. **Bài chấm điểm chỉ dùng nhãn TMRND đã `verified`** (PO tự gắn).
- **Chỉ gửi ra ngoài:** từ đơn lẻ tới dịch vụ tra cứu, và đồng bộ lên tài khoản của PO. Không lưu file gốc đã nhập.
- **Chặn vòng tròn** khi tạo ConceptLink.
- **Cụm tô sáng là mục tiêu học**, phần còn lại của câu chỉ là ngữ cảnh: không kiểm tra phần ngoài tô sáng. Lưu vị trí tô sáng bền vững khi sửa câu.
- **Tìm kiếm chạy cục bộ, offline;** chỉ mục không đồng bộ, dựng lại khi cần.
- Đo **thời gian phản xạ** do lõi thực hiện thống nhất, không để từng module tự đo.
- Ưu tiên giao diện mobile: thao tác ít, nút lớn, nhập liệu nhanh. Tác vụ nặng (nhập file lớn, tra cứu hàng loạt, đồng bộ) chạy nền, không làm đơ giao diện.

---

## 12. Lịch sử thay đổi

**v8 (bản này):**
- Làm rõ Concept (một ý) khác word/phrase (hình thức) và Example (cách diễn đạt mang nhãn TMRND); ghi triết lý tri-fold (mục 1.4); phân biệt ba kiểu liên kết example/concept; cha–con chỉ cho concept–concept, chiều con → cha.
- Viết lại kế hoạch Bản 3 thành M11a–M11e (mục 10), ưu tiên quản lý kho trước bài tập.

**v7:**
- **Bỏ AI gợi ý nhãn TMRND** (A9, mục 6.6, M10b) theo quyết định của PO sau khi thử: Gemini không phản hồi sau hơn 1 phút. Xóa mã `src/ai/`, màn `/labels`, mục AI ở Cài đặt, `AiProvider`; PO gắn nhãn tay (M10a). Giữ các trường dữ liệu cũ để không mất dữ liệu. Không đồng bộ khóa API (tính năng đồng bộ khóa làm dở đã hủy).

**v6:**
- Chi tiết Bản 2: chia thành M9a, M9b, M9c, M10a, M10b (mục 10); kiểu bài tiếng Anh Rộng và quy tắc chấm tiếng Anh (mục 5.2).
- Ghi nhận trạng thái triển khai: M0–M7b đã xong (đồng bộ Firebase đã chạy thật); M8 bỏ qua theo quyết định của PO.

**v5:**
- Thêm **tìm kiếm** (nhóm chức năng F, mục 6.7, M2b).
- Làm rõ **học cụm trong câu ví dụ bằng tô sáng** (C7): cụm tô sáng là concept cần học, phần còn lại là ngữ cảnh; câu chưa gắn concept; cột `highlight` và tự tìm cụm khi nhập file; sửa mô hình Example (`targetConceptId`, `highlight`).
- Thêm **AI gợi ý nhãn TMRND** (A9, mục 6.6, M10): gợi ý không tự thành đáp án; thêm lại `AiProvider`, `LocalSecrets`; AI chỉ dùng cho việc này.
- Đặt tên viết tắt **TMRND**; thêm trạng thái nhãn `attributesStatus` và `suggestedAttributes`.

**v4:**
- **Bỏ đọc PDF, OCR, quét trang bằng AI** và mọi thứ liên quan (pdf.js, Gemini, Tesseract, khóa API, `AiProvider`, `LocalSecrets`, spike S0, M3a).
- Thêm **nhập từ CSV/XLSX** (mục 6.4): ánh xạ cột lưu được, xem trước, phát hiện trùng, lọc theo bài, file mẫu; thêm `ImportMapping`; M3 viết lại.
- Xuất xlsx dùng cùng bộ cột với file mẫu để xuất rồi nhập lại được.
- Module tra cứu giữ nguyên nhưng bỏ phương án dự phòng bằng AI; nguyên tắc quyền riêng tư viết lại (chỉ từ đơn lẻ gửi đi tra cứu).
- Câu hỏi mở mới: định dạng file nhập, có nhập liên kết từ file không.

**v3:**
- AI quét trang PO chỉ định; đồng bộ tự động; module tra cứu tự động; chốt bộ thuộc tính và loại liên kết đầy đủ của PVO; lịch ôn theo example.

**v2:**
- Sách là PDF scan; chế độ Sâu căn chỉnh theo mô hình PVO thật; sửa nghĩa "register"; gộp kế hoạch cột mốc vào spec.

**v1:** bản đầu tiên.
