# SPEC: Công cụ học từ vựng Anh – Đức (Breadth & Depth)

> Tài liệu này dành cho Claude Code đọc để triển khai. Product Owner (PO): người dùng, dùng một mình.
> Phiên bản **v11** (nút (+) tách Thêm từ / Thêm example / Thêm concept, deck General và card con Word/Concept, chấm chính tả không phân biệt hoa/thường, chọn giọng đọc, tìm kiếm bấm Enter; xem mục 12). Trước đó **v10** (M12 xong, Deck/M13, quy ước phản hồi UI). Trước đó **v9** (quy luật UI quan hệ rút từ HUST PVO và kế hoạch M12) và **v8** (làm rõ Concept/Example, tri-fold, kế hoạch Bản 3) và **v7** (bỏ AI gợi ý nhãn). **Tool không đọc PDF và không dùng AI**: PO dùng công cụ ngoài rồi nhập bằng file CSV hoặc XLSX, và gắn nhãn TMRND (Tone, Mode, Register, Nuance, Dialect) bằng tay. Xem mục 12 để biết thay đổi so với các bản trước.
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
| **Deck** (`WordSet`) | Nhãn có tên gắn vào concept để gom từ theo mục đích (IT, từ phim…). Một concept nằm được trong nhiều deck; deck không chứa dữ liệu, từ điển theo ngôn ngữ vẫn giữ concept/example (v10) |
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

**Ba thao tác thêm dữ liệu (v11, nút (+), đừng lẫn):**
| Thao tác | Tạo ra | Dùng khi |
|---|---|---|
| **Thêm từ** (`/add/word`) | Một concept `kind: 'word'` + một example tối thiểu (chính nó) để ôn được; nhập từ/cụm, nghĩa, loại từ, deck | Từ hoặc cụm đứng riêng, hợp với danh từ ("máy bay", "cửa sổ"); không cần đặt vào câu |
| **Thêm example** (`/add/example`) | Một example: câu + cụm tô sáng (không bắt buộc) + 5 nhãn TMRND + ghi chú + **chọn concept nó thuộc về** (tìm bằng ô tìm kiếm có mô tả, hoặc tạo concept mới ngay tại chỗ). Cụm tô sáng KHÔNG tự thành concept: example gắn vào concept đã chọn (`targetConceptId`), nên nó nằm trong concept chứ không nằm ở card con Word. Chưa chọn concept thì vào Hộp chờ duyệt. "Lưu và nhập tiếp" giữ concept (và nhãn nếu tick). `/add/example?concept=<id>` mở sẵn concept | Câu hoặc cách diễn đạt đang dùng, hợp với động từ. Ví dụ: "I have a lot of houses", tô sáng "a lot of", chọn concept "số lượng nhiều" |
| **Thêm concept** (`/add/concept`) | Một concept `kind: 'concept'`, KHÔNG có example tối thiểu: tên + mô tả + deck, và ngay bên dưới **danh sách example của concept** (mỗi example có câu, cụm tô sáng, 5 nhãn TMRND, ghi chú; bấm "Thêm example này, nhập tiếp" để thêm nhiều cái; ô đang nhập cũng được lưu khi bấm "Lưu concept"). Tiếng Anh tạo concept Sâu (`mode: 'depth'`, có tri-fold và bài S1/S2); tiếng Đức là concept thường | Một ý để gom các cách nói. Ví dụ "chào hỏi" + 3 example Hello / Hi / Greetings, mỗi cái một nhãn Tone |

Word và concept cùng là một dòng bảng `concepts`, chỉ khác `Concept.kind` (tùy chọn; dòng cũ không có thì suy ra: `mode: 'depth'` là concept, còn lại là word, không cần migration). `kind` quyết định concept hiện ở card con nào trong deck (mục C6).

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
| A5 | **Thêm thủ công bằng nút (+)** (tên cũ: Ghi nhanh), tách ba lựa chọn (mục 1.4, v11): **Thêm từ** (từ/cụm kèm nghĩa), **Thêm example** (gõ/dán **cả câu rồi tô sáng cụm cần học**, C7), **Thêm concept** (một ý, chưa có cách nói). Tool bổ sung nghĩa/ví dụ (A8) và gợi ý TMRND (A9) sau, PO duyệt khi rảnh | CHỐT |
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
- C5. Phát âm tiếng Đức bằng giọng đọc có sẵn của trình duyệt/điện thoại (Web Speech API, `de-DE`). Chất lượng giọng tùy thiết bị: app tự xếp hạng giọng (ưu tiên Natural/Neural/Online/Premium/Google, đẩy eSpeak/compact xuống cuối) và **Cài đặt → Giọng đọc** cho chọn giọng khác, nghe thử, nghe chậm (lưu riêng từng thiết bị, v11). Bản sau có thể thử lấy file ghi âm từ Wiktionary nếu có (kiểm tra giấy phép từng file).
- C6. **Bộ từ điển (Dictionary)**: mỗi ngôn ngữ một bộ tự tạo, giữ concept/example/liên kết/lịch ôn. **Cập nhật 2026-11-05 (PO yêu cầu, M13):** để gom từ theo mục đích (IT, từ phim…) thêm khái niệm **Deck (`WordSet`, trước đây gọi "bộ từ"; PO đổi tên vì "bộ" tối nghĩa)**: nhãn có tên, thuộc một ngôn ngữ, gắn vào concept qua `Concept.setIds`; một concept nằm được trong nhiều bộ (dùng chung, không nhập lại). Không đổi `dictionaryId`.

- C7. **Học cụm từ trong câu ví dụ bằng cách tô sáng (highlight)** **[CHỐT hướng, ĐỀ XUẤT chi tiết]:** khi PO nhập một câu nhưng chỉ muốn học **một cụm** trong đó, PO **tô sáng cụm đó**. Quy tắc:
  - **Cụm được tô sáng = concept cần học.** Phần còn lại của câu chỉ là **ngữ cảnh**, không bị kiểm tra.
  - Tool tạo concept mới từ cụm tô sáng, hoặc gắn vào một concept đã có (tìm bằng F3). Nếu cụm đã tồn tại, tool gợi ý gắn thay vì tạo trùng.
  - **Một example có một cụm tô sáng, nhưng cụm đó có thể gồm nhiều đoạn không liền nhau (v12):** động từ tách tiếng Đức (*Wir fahren um zwölf Uhr ab* -> `fahren` + `ab`) hoặc phrasal verb bị tách bởi tân ngữ (*look the word up*). Đoạn đầu lưu ở `highlight`, các đoạn sau ở `highlightExtra`; mọi đoạn cùng là một cụm cần học. Muốn học thêm một cụm **khác** trong cùng câu, dùng nút **"Học thêm cụm khác trong câu này"** để tạo thêm một example (cùng câu, tô sáng cụm khác).
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
| F1 | **Ô tìm kiếm toàn cục** trên màn hình Hôm nay và Thư viện: tìm trong văn bản concept, nghĩa, câu ví dụ, ghi chú. **Từ v11 chỉ tìm khi bấm Enter hoặc nút "Tìm"**, không tìm theo từng ký tự (một người dùng, dữ liệu cục bộ, không cần realtime; tránh ghi mỗi ký tự vào lịch sử trình duyệt qua `?q=`) | CHỐT |
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
- **Chấm điểm nhập chính tả (cả Anh và Đức, v11):** không phân biệt hoa/thường (`Guck mal` = `guck mal`; đã áp dụng cho bốn bài tiếng Đức, trước đó tiếng Đức phân biệt); vẫn chính xác từng ký tự khác, `ä ö ü ß` phải gõ đúng (`Aepfel` không thay được `Äpfel`), chỉ bỏ khoảng trắng thừa và dấu câu cuối câu.
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

WordSet {                              // "Deck" (v10): nhãn gom concept theo mục đích
  id, name, lang                       // tên duy nhất trong một ngôn ngữ
  updatedAt, deletedAt?
}

Lesson {                               // "Bài" (v12): chủ đề có tên trong một deck, ~20 word
  id, lang, name, order,
  setId?,                              // deck chứa bài; trống = deck General
  updatedAt, deletedAt?
}                                      // tên duy nhất trong một deck; một concept thuộc tối đa một bài

Concept {                              // một từ, cụm từ hoặc nhóm từ đại diện cho một nghĩa
  id, dictionaryId, lang ("en"|"de"),
  text, pos,
  meanings[],
  grammar?: {                          // tiếng Đức
    gender?, plural?, verbForms?       // Infinitiv, Präteritum, Partizip II...
  },
  setIds?: string[],                   // deck chứa concept này (v10); rỗng = nằm trong deck General (v11)
  lessonId?: string,                   // bài của concept (v12), thuộc một trong các deck của concept
  kind?: "word" | "concept",          // card con trong deck (v11); không có thì suy ra từ mode
  verification: "unverified" | "verified",
  source: { type ("import"|"quick-add"|"lookup"), fileName?, lesson?, row? },
  status: "unknown" | "loaded" | "acquired",
  createdAt, updatedAt, deletedAt?
}

Example {                              // câu/cụm/đoạn thể hiện cách dùng
  id, dictionaryId, text,
  targetConceptId?,                    // concept của cụm tô sáng; rỗng = "câu chưa gắn concept"
  highlight?: { start, end },          // cụm cần học (một cụm mỗi example); phần còn lại là ngữ cảnh
  highlightExtra?: { start, end }[],   // các đoạn tiếp theo của cùng cụm khi bị tách (động từ tách), theo thứ tự trong câu
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
2. ~~Quy tắc tô sáng (C7)~~ **Đã chốt:** một example một cụm tô sáng; muốn học cụm khác trong cùng câu thì tạo example mới. **Bổ sung (v12, PO yêu cầu 2026-11-07):** một cụm được gồm nhiều đoạn không liền nhau để hỗ trợ động từ tách (`highlightExtra`).
3. **Định dạng file nhập:** công cụ ngoài của PO xuất ra những cột nào? Cần vài dòng đầu của file thật để chốt bộ cột ở mục 6.4.
4. **Liên kết trong file nhập:** có cần nhập liên kết concept/example từ file không? **[ĐỀ XUẤT]** chưa nhập liên kết từ file (PO giữ đề xuất; file nhập hiện chỉ có cột `deck` cho deck).
5. **Thuật toán spaced repetition** (đơn vị là example): kiểu SM-2 đơn giản hay mới hơn?
6. ~~Bộ từ điển (Dictionary)~~ **Đã chốt (2026-11-05):** từ điển vẫn mỗi ngôn ngữ một bộ; để gom từ theo mục đích PO yêu cầu thêm **Deck** (`WordSet`), một concept nằm được trong nhiều deck (C6, mục 10 Bản 4).
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

- **S2 (M11d) hỏi thế nào:** tình huống được dựng từ **một nhãn** mà cách nói đúng khác mọi lựa chọn còn lại, nên chỉ một lựa chọn phù hợp; chỉ dùng nhãn `verified` và các cách có tổ hợp nhãn khác nhau. Kịch bản cho từng giá trị là cấu hình. Lựa chọn gồm cả cách nói nối từ concept khác bằng `ExampleLink`, nhưng chỉ hỏi về example chủ của concept.
- Chưa nhập liên kết từ file (PO giữ đề xuất). S3 (nhớ liên kết) làm sau.
- Bài S1/S2 chỉ ghi log và lịch ôn theo example, **chưa** ảnh hưởng trạng thái `acquired` của concept (chờ dữ liệu dùng thật).

### Bản 3b: Làm lại UI quan hệ theo quy luật HUST PVO (v9, PO đã đồng ý; **M12a–d xong, v10**)
Lý do: UI quan hệ concept/example hiện khó định hướng (PO phản hồi 2026-11-05). PO yêu cầu đọc toàn bộ ảnh trong `docs/reference/hustpvo` (40 ảnh) và rút quy luật. Dưới đây là quy luật quan sát được; chỉ mượn **mô hình khái niệm và cách tổ chức màn hình**, không sao chép mã nguồn hay đồ họa.

**Quy luật rút ra (R1–R8):**
- **R1. Liên kết concept luôn đọc là "con → cha" và thấy cả hai đầu.** Màn Concept của HUST PVO có ba cột: ô "Search child" + danh sách (trái); dòng `blue → color`, ô Relation (*No link / Association / Type of*) và nút Save (giữa); ô "Search parent" + danh sách (phải). Tên ở đầu cột giữa đổi theo lựa chọn. Thứ tự con → cha → loại quan hệ giống hệt file nhập (cột *Child, Parent, Relation*).
- **R2. Mặc định "No link"; chọn "No link" chính là xóa liên kết.** Chọn một cặp đã nối thì ô Relation hiện loại hiện tại; Save chỉ sáng khi có thay đổi.
- **R3. Chọn concept bằng ô tìm kiếm, mỗi danh sách hiện mô tả của concept đang chọn (để tránh nhầm từ đồng hình); gõ từ chưa có thì hiện "No match concept. Add?" để tạo ngay tại chỗ.**
- **R4. Nối ngược một cặp đã có thì hỏi đổi chiều, không chỉ báo lỗi.** Hộp thoại: *"color" is currently linked to "blue" as a parent. Change the direction accordingly?* (Cancel / Change). Chỉ khi thật sự tạo vòng dài hơn mới báo "Circular link". Import dùng cùng các thông báo, kèm "Row is duplicated".
- **R5. Liên kết example–concept tạo ngay trong màn example và chỉ có MỘT danh sách.** Màn example: ô văn bản (có nút tô sáng), ô Relation (8 loại) + nút Link, chip "Selected concept" + ô tìm kiếm + mô tả, vùng **Linked Concepts** (mọi concept đã nối, dạng chip), năm ô TMRND + Notes, và "Re-use parameters" + "Save & Reset" (giữ Relation/nhãn cho example kế tiếp để nhập nhanh). PVO **không** phân biệt "concept chủ" với "liên kết thêm".
- **R6. Màn Tree dùng hai trục.** Trục ngang là phân cấp `Children → [concept] → Parent` (thẻ cha ghi loại quan hệ rồi tên). Trục dọc là ví dụ: một hàng **8 ô đếm theo loại liên kết** (*Idiom 0 · … · Other phrase 1*); bấm một ô thì danh sách ví dụ loại đó hiện ra, cụm được tô vàng, có nút sửa. Chế độ Full thêm cột điều hướng dạng đề cương có số đếm (*Parents (n) · Children (n) · Example (n) ▸ loại (n)*) và khung "Selected example" kèm chip nhãn và chip Linked Concepts.
- **R7. Hai kiểu tìm kiếm.** *Search Example*: từ khóa, 5 bộ lọc TMRND, lọc theo Linked concepts, "Only search undecided examples", nhớ tham số lần trước. *Search Concept Association*: chọn tối đa 10 concept rồi tìm các concept nối với chúng, kèm đồ thị (nút đỏ = đã chọn, xám = liên quan). Đây là mục đích cốt lõi của PVO: nhớ lại từ qua mạng liên kết.
- **R8. Quy ước chung.** Dấu `(*)` cho trường bắt buộc; hộp thoại xác nhận nêu hậu quả bằng số; thao tác theo concept qua menu (Add example / View tree / Edit / Delete); toast vàng cảnh báo, xanh thành công.

**Quyết định của PO (2026-11-05):**
1. **Gộp ở giao diện thành MỘT danh sách "Liên kết"** cho example–concept (như *Linked Concepts*). Dữ liệu giữ nguyên để không đụng lịch ôn, Hộp chờ duyệt, tìm kiếm: `targetConceptId` là liên kết đầu tiên (concept chủ), các liên kết sau lưu bằng `ExampleLink`. Người dùng không phải biết hai cơ chế; chỉ cần có thể đổi liên kết nào là "chủ" (ghi chú nhỏ, không phải khái niệm chính).
2. **Thứ tự làm:** căn chỉnh nút (toàn app) → màn liên kết concept → màn Tree → liên kết trong màn example. Tìm theo liên kết (R7) và đồ thị làm sau.
3. **Bố cục điện thoại:** cha ở trên, concept ở giữa, con ở dưới; hàng đếm loại liên kết ngay dưới concept, bấm một loại để xem ví dụ.

**Căn chỉnh nút và khoảng cách (PO yêu cầu thêm).** Đo thực tế trên Chrome 420 px: trong cùng một hàng, nút *Lưu* cao 50 px, nút viền *Xóa* cao 50 px nhưng nút *Thêm cách diễn đạt* cao 48 px; nút `ghost` có padding ngang 12 px còn nút khác 24 px nên chữ lệch khỏi mép nội dung; nút chính không viền còn nút phụ viền 1,5 px nên hai nút cạnh nhau lệch kích thước; liên kết chữ (`<a>` như "Sửa / gắn nhãn", "Xem cây") không cùng khuôn với nút; mỗi màn tự viết hàng `.actions` riêng (có nơi `flex-wrap`, nơi không). Hướng sửa: mọi biến thể nút dùng cùng một khuôn (chiều cao cố định, viền 1,5 px trong suốt cho nút không viền, padding cố định theo cỡ), nút chữ/ghost căn thẳng mép bằng lề âm hoặc dùng chung khuôn; một thành phần hàng nút dùng chung (`gap`, `wrap`, căn lề thống nhất) và một `LinkButton` cho liên kết router có cùng kích thước; sau đó chụp lại mọi màn để kiểm.

| Mốc | Nội dung | Xong khi |
|---|---|---|
| **M12a** Căn chỉnh nút và khoảng cách | Sửa `ui/Button` (một khuôn cho mọi biến thể, chiều cao cố định), thêm `ButtonRow` và `LinkButton`; thay các hàng `.actions` và liên kết chữ dạng nút ở mọi màn; kiểm tra lại các màn Hôm nay, Học, Thư viện, concept (Rộng và Sâu), example, Tree, Cài đặt, Nhập file ở 420 px | Trong ảnh chụp, mọi nút cùng hàng bằng chiều cao, chữ ghost thẳng mép nội dung, không còn khoảng cách lệch giữa các màn |
| **M12b** Màn liên kết concept (R1–R4) | Màn Concept dạng "con → cha": ô tìm con, dòng `con → cha`, Relation (No link / Association / Type of), Save; tìm có mô tả; "Thêm?" tạo concept tại chỗ; chọn "No link" để xóa; nối ngược cặp đã có thì hỏi đổi chiều, vòng dài hơn báo "Vòng tròn"; menu thao tác theo concept (Thêm ví dụ, Xem cây, Sửa, Xóa) | Tạo, đổi loại, xóa, đổi chiều một liên kết chỉ trong một màn; C→A vẫn bị chặn |
| **M12c** Màn Tree theo R6 | Cha ở trên, concept giữa, con dưới; hàng đếm 8 loại liên kết; bấm loại để xem ví dụ (cụm tô vàng, nút sửa); điều hướng nhanh sang concept cha/con | Từ concept thấy cha, con, và số ví dụ từng loại; bấm loại hiện đúng ví dụ |
| **M12d** Liên kết trong màn example (R5) | Một danh sách "Liên kết" (chip kèm loại), chọn concept bằng tìm kiếm có mô tả + tạo tại chỗ, Relation + nút Link, đánh dấu liên kết chủ; "Giữ tham số" + "Lưu và nhập tiếp" để nhập hàng loạt | Một example nối nhiều concept bằng một thao tác thống nhất; dữ liệu cũ (`targetConceptId`, `ExampleLink`) hiện đúng trong danh sách |
| Làm thêm sau M12d | Lối vào sửa example từ Hộp chờ duyệt (ví dụ chưa có concept: "Gắn concept" đặt concept chủ). **Tìm theo liên kết (R7)**: `/association`, chọn tối đa 10 concept, thấy concept nối một bước (cả hai chiều) dạng đồ thị SVG tự vẽ (đỏ = đã chọn, xám = liên quan, mũi tên con → cha, nét đứt = Association; chạm nút để thêm/bỏ) và danh sách | Xong (v10). Làm theo yêu cầu của PO 2026-11-05; thay cho dòng "chưa hiển thị đồ thị" của các bản đầu |
| Để sau | Lọc ví dụ theo concept liên kết, nhập liên kết từ file (bảng *Child/Parent/Relation* như PVO), chế độ Full của Tree, Tree/đồ thị lọc theo deck | PO quyết sau khi dùng thật |

### Bản 4: Deck (v10, PO yêu cầu 2026-11-05)
Lý do: gom tất cả từ vào một thư viện của một ngôn ngữ thì khó chọn ra sau này (bộ từ cho ngành IT, từ thu thập khi xem phim…). PO chọn hướng **một concept dùng chung cho nhiều deck**. Tên hiển thị là **Deck** ("bộ từ" nghe tối nghĩa); trong mã vẫn là `WordSet`.
- **Mô hình:** deck là nhãn gắn vào concept (`Concept.setIds`), không chứa dữ liệu; từ điển theo ngôn ngữ vẫn giữ concept, example, liên kết, lịch ôn nên liên kết cha/con vẫn xuyên deck và dữ liệu cũ không phải chuyển. Bảng `wordSets` (schema v6), vào đồng bộ và sao lưu, xóa mềm. Tên deck duy nhất trong một ngôn ngữ (không phân biệt hoa/thường). **Xóa deck xóa luôn nội dung (v11, PO yêu cầu 2026-11-05):** các concept chỉ nằm trong deck đó bị xóa cùng example, liên kết và đoạn văn không còn lỗ nào; concept còn nằm ở deck khác được giữ và chỉ bỏ nhãn deck này; xóa mềm nên có Hoàn tác; hộp xác nhận nêu số concept và example. Deck General không xóa được.
- **M13a:** quản lý deck (`/sets`: tạo, đổi tên, xóa), hàng lọc ở Thư viện (Tất cả / từng deck / Chưa xếp deck, có số đếm, nhớ lần trước), thẻ "Deck" ở màn concept (tick nhiều deck, tạo tại chỗ), ô "Thêm vào deck" ở Ghi nhanh (nhớ lần trước; từ đã có cũng được thêm vào deck, không nhân đôi).
- **M13b:** Nhập file có cột `deck` (nhiều deck cách nhau `;`; tên cột `set`, `bộ từ`… vẫn nhận) và ô chọn deck đích là **danh sách deck có sẵn** hoặc "+ Tạo deck mới…" (dùng lại deck cùng tên nếu đã có); deck có sẵn chỉ nhận từ cùng ngôn ngữ; từ đã có cũng được thêm vào deck kể cả khi chọn "Bỏ qua"; hoàn tác khôi phục deck cũ. Màn Học (theo từng ngôn ngữ) và Hôm nay (cả hai ngôn ngữ) cho chọn deck cần học/ôn (rỗng = tất cả). Tìm kiếm có bộ lọc Deck. Xuất xlsx có cột `deck`.
- **Chưa làm:** Tree và đồ thị liên kết lọc theo deck; đối chiếu tên deck trong cột `deck` của file với deck có sẵn.

### Bản 5: Thêm dữ liệu và duyệt Thư viện (v11, PO yêu cầu 2026-11-05)
Lý do: PO thấy UI thêm dữ liệu gây rối giữa **deck – word – example – concept – association** (HUST PVO tách rõ Concept và Example; Duo có thêm "Ghi nhanh" và "thêm từ" nên khó biết (+) làm được gì), kéo theo rối cách tìm kiếm và ôn tập.
- **Deck General (có sẵn, mỗi ngôn ngữ một cái, không lưu dữ liệu):** concept không thuộc deck nào tự nằm trong General; gán vào deck khác thì rời General. Là mặc định của Thư viện, ô "Deck của concept" ở các màn thêm ("General (mặc định)") và ô chọn deck đích khi nhập file. Không đổi tên/xóa được. Câu chưa tô sáng ở Hộp chờ chưa có concept nên chưa thuộc deck nào.
- **Thư viện theo ba cấp, chỉ tải khi bấm:** (1) card deck (General, các deck, kèm số; nút "Xem tất cả" và "Quản lý deck"); (2) bấm deck → hai **card con** "Concept <deck>" và "Word <deck>" kèm số mục (chỉ đếm, chưa tải danh sách); (3) bấm card con → mới tải danh sách concept hoặc word của deck đó; bấm một concept → màn chi tiết liệt kê example của concept (Ví dụ N). Địa chỉ `/library?deck=general|all|<id>&sub=word|concept`; nút quay lại đi từng cấp. Số đếm và danh sách đọc từ IndexedDB trên máy (không có request mạng); chưa có chỉ mục theo deck nên vẫn duyệt các dòng concept của ngôn ngữ đó, nhưng không giữ cả danh sách trong bộ nhớ trang ở màn card.
- **Nút (+) mở màn "Bạn muốn thêm gì?"** với ba thẻ lớn (Thêm từ / Thêm example / Thêm concept), mỗi thẻ một định nghĩa một dòng và một ví dụ (mục 1.4); `/quick-add` cũ chuyển sang `/add`. Thêm từ và Thêm concept có ô "Ở lại trang này để ghi tiếp" như trước.
- **Nhãn trong giao diện (v11):** "từ" chỉ còn là từ ngữ tiếng Việt thông thường (danh từ, động từ, loại từ, từ điển, "từ file"). Khi nói về dữ liệu của kho thì dùng **concept** (đếm, danh sách, tra cứu, ôn tập, thụ đắc) hoặc **word** (đúng nghĩa loại `word`: nút Thêm word, card con Word, nhãn Word ở kết quả tìm kiếm). Cột file nhập vẫn nhận tên cũ (`từ`, `từ vựng`, `cụm từ`…).
- **Chưa làm (PO quyết sau):** lối tắt theo ngữ cảnh (card deck có "+ Concept" chọn sẵn deck; concept có "+ Example" chọn sẵn concept ngoài nút "Thêm ví dụ" đã có); nhãn "Chưa có ví dụ"; đổi loại word ⇄ concept sau khi tạo; Học, Ôn, Tìm kiếm chưa có lựa chọn "General" riêng (rỗng = tất cả).

### Bản 6: Học theo đoạn văn, đục lỗ (v11, PO yêu cầu 2026-11-05)
Ngữ cảnh học thứ ba, bên cạnh example (một câu) và concept (một ý): **một đoạn văn**. Ví dụ đoạn mô tả hoạt động hằng ngày: "He brushes his teeth, shaves, and takes a shower. …". PO dán đoạn văn (Anh hoặc Đức), bôi đen những word cần học rồi **đục lỗ**; khi ôn, đoạn văn hiện cả đoạn với các chỗ trống đánh số và PO điền lại.
- **Mô hình (không phá nguyên tắc cứng):** bảng mới `passages` (`Passage` = id, dictionaryId, lang, title?, text; schema Dexie v7, vào đồng bộ và sao lưu, xóa mềm). **Mỗi lỗ là một Example**: `text` = cả đoạn, `highlight` = lỗ, `passageId` = đoạn, `targetConceptId` = word của lỗ. Nhờ đó lịch ôn, ReviewLog và thụ đắc vẫn tính theo example (mỗi đoạn là thêm một ngữ cảnh cho word).
- **Lỗ → word (PO chọn):** mỗi lỗ tự tạo word cùng chữ (`kind: 'word'`, kèm example tối thiểu, vào deck đã chọn, mặc định General) hoặc gắn vào word/concept đã có trùng chữ.
- **Màn:** nút (+) có thẻ thứ tư **Thêm đoạn văn** (`/add/passage`: tiêu đề, deck, và một khung đoạn văn có **hai chế độ trên cùng một đoạn**: *Đục lỗ* hiện đoạn văn dạng chữ, chạm một word để đục lỗ, chạm lỗ để bỏ, bôi đen một cụm rồi bấm "Đục lỗ cụm đã chọn" để đục cả cụm, lỗ hiện nền màu kèm số; *Sửa chữ* đổi đoạn thành ô gõ, các lỗ đi theo chữ. Chọn hai chế độ thay vì sửa trực tiếp trên chữ có lỗ vì `contenteditable` hay lỗi với bộ gõ tiếng Việt và bàn phím Android); `/passages` mở bằng **card deck** (General và các deck, chỉ hiện số đoạn văn); bấm card mới đọc danh sách đoạn văn của deck đó (xem trước 120 ký tự, số lỗ đếm theo từng đoạn), để không tải mọi đoạn văn; lưu đoạn văn xong về các card này, không về danh sách (xóa đoạn xóa các lỗ, giữ word); `Passage.setId` nhớ deck lúc thêm; schema v9 thêm chỉ mục `examples.passageId`; schema v10 gán deck cho đoạn cũ theo deck của các word ở lỗ (deck có nhiều word nhất, hòa thì theo id nhỏ hơn, word không thuộc deck nào thì ở General); màn Sửa đoạn văn đổi được deck của đoạn (không chuyển các word đã có); lối vào ở Thư viện. **Sửa đoạn linh hoạt:** màn `/passages/:id` (nút Sửa) và ô đoạn văn ở màn thêm dùng chung `PassageEditor`; sửa chữ thì các lỗ **đi theo** chữ (`remapGaps`: lỗ trước chỗ sửa giữ nguyên, sau chỗ sửa dịch vị trí, sửa chính trong một lỗ thì lỗ co giãn theo, chỉ lỗ bị chỗ sửa cắt qua mép mới bị bỏ và có báo). Lưu sửa (`updatePassage`): lỗ giữ lại vẫn là example cũ nên **giữ lịch ôn và lịch sử**, lỗ bị bỏ thì xóa example, lỗ mới thành word như thêm mới; có thể bôi đen thêm lỗ hoặc bỏ lỗ.
- **Bài `en.passage-cloze` và `de.passage-cloze`** (`src/exercises/passage.ts`, mode breadth, `passage: true`): hiện cả đoạn và **ô nhập nằm ngay trong đoạn văn, đúng chỗ trống** (đánh số nhỏ, `Exercise.segments`; Tab chuyển ô; sau khi chấm ô đúng xanh, ô sai đỏ và đáp án các lỗ sai liệt kê dưới), **không gợi ý**, chấm không phân biệt hoa/thường (tiếng Đức vẫn phân biệt `ä ö ü ß`). Word đã `acquired` hiện sẵn trong chữ, không hỏi lại; đoạn không còn lỗ nào để hỏi thì bỏ qua. **Một câu hỏi = cả đoạn, nhưng ghi log, lịch ôn và thụ đắc cho TỪNG lỗ** (`Exercise.parts`; thời gian phản xạ chia đều cho các lỗ để đoạn dài không bị tính là chậm). Một đoạn chỉ được hỏi một lần mỗi phiên dù nhiều lỗ đến hạn.
- **Cách ly:** example của lỗ chỉ dùng cho bài đoạn văn (`ExerciseModule.passage`, `acceptsExample`); các bài khác bỏ qua chúng, và chúng không tính là "cách diễn đạt" của concept Sâu và không vào chỉ mục cách nói của tìm kiếm.
- **Chưa làm:** lọc đoạn theo deck, bài đục lỗ chọn từ ngân hàng, nghe đọc đoạn, nhập đoạn từ file.

### Bản 7: Dữ liệu tiếng Đức đầy đủ, nhập tay và nhập file khớp nhau (v12, PO yêu cầu 2026-11-07)
Lý do: file nhập tiếng Đức mang nhiều thông tin (giống, số nhiều, dạng động từ, câu ví dụ, ghi chú) nhưng màn hình không hiện hết hoặc không sửa được, và màn **Thêm word** không có chỗ nhập các thông tin đó. Mục tiêu: nhập tay và nhập file cho ra **cùng một dạng dữ liệu** (`Concept.grammar`, `Example`), và mọi thông tin từ file đều xem được, sửa được.

**Đã chốt (PO accept):**
- Loại từ ở màn **Thêm word** là **hộp chọn** (cả Anh và Đức), danh sách là cấu hình theo ngôn ngữ (`features/quick-add/posOptions.ts`). Đã làm.
- Màn **Thêm word** chỉ **thêm ô khi chọn tiếng Đức**; tiếng Anh giữ 4 ô (deck, word, nghĩa, loại từ). Với tiếng Đức, ô hiện theo loại từ: **Noun** thêm giống (`der`/`die`/`das`) và số nhiều đầy đủ; **Verb** thêm Infinitiv (tự điền bằng chính word), Präsens er/sie/es, Präteritum, Partizip II; loại khác không thêm ô. Câu ví dụ và ghi chú thu gọn sẵn, mở khi cần. Chỉ Word là bắt buộc.
- **Câu ví dụ nhập tay thay cho example tối thiểu:** có câu thì lưu example thật gắn vào word (tự tô sáng word trong câu, tô tay được, hỗ trợ cụm tách); không có câu thì vẫn tạo example tối thiểu (C4).
- Cấu hình "ô nào hiện cho ngôn ngữ và loại từ nào" nằm trong một registry (`wordForms`), không viết cứng trong trang (nguyên tắc 3). Không cần migration.
- Hiện trạng liên kết: nhập file gắn example vào word cùng dòng và tự tô sáng nếu tìm thấy word trong câu; không tìm thấy (vd cụm tách mà thiếu cột `highlight`) thì example vào Hộp chờ duyệt, chưa gắn vào word.

**Các bước (mỗi phiên một bước, làm theo thứ tự):**

| Bước | Nội dung | Xong khi |
|---|---|---|
| **M14a** Xem trước khi nhập file | Bước duyệt trong màn Nhập file hiện cho mỗi word: loại từ, deck, dòng ngữ pháp (`die · Pl. Adressen`, các dạng động từ), câu ví dụ có cụm tô sáng (cả cụm tách), nhãn TMRND và ghi chú. *Đã code, chưa commit, chờ PO kiểm.* | Nhập file mẫu Goethe A1: thấy đủ giống, số nhiều, dạng động từ, câu và ghi chú trước khi bấm Nạp |
| **M14b** Chi tiết concept xem và sửa được | Loại từ là hộp chọn (nhận cả `Noun` viết hoa từ file); giống (hộp chọn), số nhiều, 4 dạng động từ sửa được và lưu vào `grammar`; hiện bài và nguồn (tên file, dòng); mỗi example hiện ghi chú và giá trị nhãn đã `verified` | Sửa số nhiều của một word đã nhập từ file, lưu, mở lại thấy đúng; bài giống/số nhiều dùng giá trị mới |
| **M14c** Thêm word tiếng Đức: ô ngữ pháp (*đã làm*) | Registry `wordForms` (`features/quick-add/wordForms.ts`: ngôn ngữ + loại từ -> danh sách ô); màn Thêm word hiện ô giống/số nhiều (Noun) hoặc 4 dạng động từ (Verb) khi chọn tiếng Đức; lưu vào `grammar` (Infinitiv trống thì lấy chính word); nút **Tra cứu để điền** (Wiktionary, chỉ từ đơn) điền loại từ, nghĩa, giống, số nhiều, dạng động từ vào các ô còn trống, không ghi đè chữ đã gõ, kèm nguồn và giấy phép; tiếng Anh không đổi | Thêm tay *die Adresse* với số nhiều *Adressen*, bài giống/số nhiều hỏi được; chuyển sang tiếng Anh thì chỉ còn 4 ô |
| **M14d** Thêm word tiếng Đức: câu ví dụ và ghi chú (*đã làm*) | Khối thu gọn "Câu ví dụ" (dùng lại `ExampleFields`: tô sáng, tô thêm đoạn, nhãn) và "Ghi chú"; có câu thì lưu example thật gắn vào word và không tạo example tối thiểu; tự tô sáng word trong câu nếu có đúng dạng đã gõ (không thì PO tô tay, kể cả cụm tách); từ đã có trong thư viện thì câu được thêm vào từ đó; chỉ hiện với tiếng Đức | Thêm tay một word kèm câu: word và example liên kết, example hiện ở chi tiết word, không có example tối thiểu thừa |
| **M14e** Cột `praesens3sg` trong file (*đã làm*) | Thêm cột `praesens3sg` vào danh sách cột nhập, file mẫu và xuất xlsx (mục 12.2); bài chia động từ dùng được dạng er/sie/es từ file mà không chờ tra cứu. Nhập lại file chỉ có cột này cho từ đã có (chọn gộp hoặc cập nhật) thì thêm dạng er/sie/es vào mà giữ nguyên các dạng đã lưu | Nhập file có `praesens3sg`, bài chia động từ hỏi được động từ đổi thân (`fahren` -> `fährt`) |

**Đã chốt (PO, 2026-11-07):** ngữ pháp gõ tay, từ file hay từ tra cứu đều lưu `unverified` (cùng nguyên tắc 8); màn Thêm word có nút "Tra cứu để điền" (kết quả chỉ là gợi ý, PO kiểm tra rồi mới lưu).

### Bản 8: Bài (lesson) trong deck (v12, PO yêu cầu 2026-11-07)
Lý do: PO học tiếng Đức A1 theo giáo trình có danh sách từ chia theo **bài**, mỗi bài là một **chủ đề có tên** (family, daily activities…), khoảng 20 word. Deck A1 có hai card con Concept/Word nhưng không có chỗ chứa các bài, nên không ôn được theo bài. Hiện `lesson` chỉ là chuỗi tự do trong `Concept.source.lesson` (từ file nhập, không sửa được, gõ khác một chữ là thành bài khác), chỉ màn Học lọc được và gộp chung mọi deck.

**Đã chốt (PO, 2026-11-07):**
- **Bài là một đối tượng nhẹ nằm trong deck**, không phải deck con (không có tầng deck lồng nhau, không chia Concept/Word trong từng bài). Mỗi bài có tên và thứ tự.
- Dữ liệu sạch: gắn bài bằng **hộp chọn** từ danh sách (không gõ tay); đổi tên bài ở một chỗ thì mọi từ trong bài đổi theo; xóa bài chỉ gỡ nhãn bài khỏi các từ, không xóa từ.
- **Một từ thuộc một bài.** Từ cần ở hai chủ đề thì dùng deck (một từ nằm được trong nhiều deck).
- **Thứ tự bài** theo thứ tự xuất hiện lần đầu trong file nhập (đúng thứ tự giáo trình), đổi thứ tự được sau.
- **Bài luôn thuộc một deck hoặc deck General**; tên bài duy nhất trong một deck (không phân biệt hoa/thường).
- Cột `lesson` của file nhập tìm bài cùng tên trong deck (hoặc tạo mới), giống cột `deck`.
- Ôn tập, Học, Phản xạ chớp nhoáng, Hôm nay chọn deck rồi **tick một hoặc nhiều bài**. Thư viện: trong deck có thêm card **"Bài"**, bấm vào ra danh sách bài, bấm một bài ra thẳng các từ của nó.
- Mô hình dữ liệu: bảng mới `lessons` (`Lesson` = id, lang, setId?, name, order; `setId` trống = deck General; vào đồng bộ và sao lưu, xóa mềm) và `Concept.lessonId?`. **Schema Dexie v8** (`CURRENT_SCHEMA_VERSION` = 8). `Concept.source.lesson` vẫn giữ làm bản ghi nguồn gốc của file nhập, không dùng để lọc nữa.
- **Migration:** mỗi concept có `source.lesson` được gắn vào bài cùng tên (tạo nếu chưa có) của deck đầu tiên trong `setIds`, hoặc của deck General nếu không có deck; thứ tự bài theo thứ tự concept được tạo. Không mất dữ liệu cũ.
- Khi một từ bị gỡ khỏi deck của bài thì `lessonId` của nó bị xóa (bài không "sống" ngoài deck của nó).

**Các bước (mỗi phiên một bước, theo thứ tự):**

| Bước | Nội dung | Xong khi |
|---|---|---|
| **M15a** Dữ liệu (*đã làm*) | Bảng `lessons`, `Concept.lessonId`, schema v8 và migration từ `source.lesson`; vào `SYNC_TABLES` và `BACKUP_TABLES`; xóa deck thì xóa mềm cả bài của deck (Hoàn tác khôi phục cả bài và nhãn bài của từ dùng chung); id bài của migration sinh theo ngôn ngữ + deck + tên nên hai máy cùng nâng cấp không tạo bài trùng khi đồng bộ; một từ rời deck của bài thì rời bài | Mở dữ liệu cũ có `source.lesson`: các từ nằm đúng bài của đúng deck; xuất rồi nhập lại JSON giữ nguyên bài |
| **M15b** Quản lý bài (*đã làm*) | Module `src/lessons` (tạo, đổi tên, đổi thứ tự, xóa gỡ nhãn, gắn từ vào bài, tìm hoặc tạo theo tên) và màn `/lessons?deck=general|<id deck>` (chọn ngôn ngữ và deck, tạo, đổi tên, đưa lên/xuống, xóa có ô xác nhận tại chỗ và Hoàn tác; lối vào là nút "Quản lý bài" ở Thư viện) | Tạo bài "Family" trong deck A1, đổi tên thì các từ trong bài đổi theo, xóa bài thì từ vẫn còn |
| **M15c** Nhập và xuất file (*đã làm*) | Cột `lesson` tìm hoặc tạo bài trong deck của file (deck từ cột `deck` hoặc deck đích); bước duyệt hiện bài; hoàn tác lần nhập xóa bài do lần nhập tạo ra và trả từ về bài cũ; xuất xlsx ghi tên bài. Bài nằm trong deck đầu tiên của từ (General nếu không có deck). Từ đã có: gộp chỉ điền bài còn trống, cập nhật thì thay bài, bỏ qua thì giữ nguyên. Tóm tắt sau khi nhập báo số bài mới và số từ được xếp bài | Nhập file Goethe A1: bài tạo đúng thứ tự trong file, nhập lại không tạo bài trùng |
| **M15d** Gắn bài bằng tay (*đã làm*) | Hộp chọn "Bài" (danh sách bài của deck đã chọn, có "+ Tạo bài mới…") ở Thêm word (lựa chọn nhớ giữa các lần lưu để nhập cả danh sách vào một bài; đổi deck thì bỏ chọn bài; từ đã có trong thư viện cũng được xếp vào bài) và thẻ "Bài" ở chi tiết concept (Rộng và Sâu; đổi là lưu ngay như thẻ Deck; từ nằm nhiều deck thì bài nhóm theo deck và chỉ chọn, không tạo ở đây) | Thêm tay một word vào bài có sẵn; đổi bài ở chi tiết; chọn deck khác thì danh sách bài đổi theo |
| **M15e** Thư viện theo bài (*đã làm*) | Card "Bài" (thẻ thứ ba cạnh Concept và Word, có ở General và từng deck, không có ở "Xem tất cả") → danh sách bài kèm số từ, thêm thẻ "Chưa xếp bài" cho các từ của deck chưa thuộc bài nào → danh sách từ của bài theo thứ tự nhập (chỉ tải khi bấm); địa chỉ `/library?deck=…&sub=lesson&lesson=<id|none>` | Từ deck A1 vào được bài Family và thấy đúng khoảng 20 từ |
| **M15f** Học và ôn theo bài (*đã làm*) | Chọn deck rồi tick nhiều bài ở Học, Ôn tập, Phản xạ chớp nhoáng và Hôm nay (thay ô chọn một chuỗi bài của màn Học); bài hiện nhóm theo deck, chỉ gồm bài của các deck đã tick (không tick deck nào thì bài của mọi deck, kể cả General); deck và bài cùng áp dụng; lựa chọn nhớ riêng từng thiết bị; tick bài của deck đã bỏ tick thì không còn lọc; số từ đến hạn đếm theo bài đã chọn; bộ lọc Bài và chỉ mục tìm kiếm dùng tên bài mới (`Concept.lessonId`) thay cho chuỗi `source.lesson`. **Bản 8 xong** | Ôn tập chỉ ra các từ của hai bài đã tick; số từ đến hạn khớp |

### Quy ước phản hồi giao diện (v10, PO yêu cầu 2026-11-05) **[CHỐT]**
- **Không dùng `confirm()`/`alert()` của trình duyệt.** Thông báo dùng **badge (toast)** ở đầu màn hình: nhỏ (cao ~38 px), tự tắt sau 2,5 s (4,5 s nếu có nút hoặc là lỗi), dừng khi rê chuột/focus, vẫn còn sau khi chuyển trang.
- **Xóa phải có ô xác nhận** hiện ngay tại nút (panel trong trang, không phủ màn hình), nêu hậu quả bằng số, focus ở "Hủy", Esc để hủy; sau khi xóa vẫn có badge **"Hoàn tác"** (xóa mềm nên khôi phục được concept, ví dụ và mọi liên kết đi kèm).
- **Lưu xong thì báo bằng badge và chuyển trang**: lưu concept → Thư viện; lưu ví dụ → concept (hoặc Hộp chờ nếu chưa có concept); Ghi nhanh → Thư viện (câu chưa tô sáng → Hộp chờ duyệt), có ô "Ở lại trang này để ghi tiếp" cho nhập hàng loạt; "Lưu và nhập tiếp" ở màn ví dụ ở lại trang. Lỗi nhập liệu vẫn hiện cạnh ô.
- **Mọi control có phản hồi hover (chỉ trên thiết bị có chuột), focus bàn phím (`:focus-visible`) và trạng thái bấm**; placeholder mờ khi ô được focus; tôn trọng `prefers-reduced-motion`.

### Về sau
Mở rộng chiều sâu cho tiếng Đức, ghi âm từ Wiktionary, nguồn tra cứu dự phòng cho tiếng Anh (khi Free Dictionary API không kết nối được trên máy PO), các module nguồn từ mới nếu cần.

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

## 12. Format input file

Mô tả file mẫu (A1e) mà màn **Nhập từ file** tải về và đọc vào. Danh sách cột là cấu hình ở `src/import/fields.ts`; quy tắc xử lý ở `src/import/build.ts`; file mẫu sinh bởi `src/import/template.ts`. Mục 6.4 là nguyên tắc, mục này là định dạng cụ thể.

### 12.1 Tệp
- **Định dạng:** CSV (`.csv`) hoặc XLSX (`.xlsx`, đọc sheet đầu tiên, chọn được sheet khác).
- **CSV:** dấu phân cách phẩy, chấm phẩy hoặc tab (tự nhận); mã hóa UTF-8 có hoặc không BOM (nếu lỗi thì thử windows-1252). File mẫu CSV là UTF-8 **có BOM** để Excel hiển thị đúng `ä ö ü ß`. Ô chứa dấu phân cách, dấu nháy kép hoặc xuống dòng thì bọc trong `"…"`, dấu `"` bên trong viết đôi `""`.
- **Dòng đầu là tiêu đề cột**; mỗi dòng sau là **một concept** kèm tối đa một example. Muốn thêm example cho cùng concept thì thêm dòng có cùng `text` (app gộp nhờ phát hiện trùng, A1c).
- Tiêu đề không phân biệt hoa/thường, bỏ dấu; có thể khác tên trong bảng dưới (xem cột "Tên nhận tự động"), nếu không nhận được thì PO chỉ cột tại bước ánh xạ (A1a, lưu lại cho lần sau). Cột thừa bị bỏ qua. Thứ tự cột tùy ý.
- Mỗi ô được chuẩn hóa: Unicode NFC, gộp khoảng trắng liền nhau, cắt hai đầu; **giữ nguyên chữ hoa** (danh từ tiếng Đức). Dòng trống hoàn toàn được bỏ qua và chỉ đếm.

### 12.2 Các cột
Chỉ `text` bắt buộc. Cột mẫu theo đúng thứ tự dưới đây.

| Cột | Bắt buộc | Nội dung | Tên nhận tự động |
|---|---|---|---|
| `text` | **Có** | Word hoặc cụm (concept). Thiếu thì dòng bị báo lỗi và bỏ qua | text, word, term, vocabulary, concept, wort, từ, từ vựng, cụm từ |
| `lang` | Không | `en` hoặc `de`. Trống thì dùng ngôn ngữ PO chọn cho cả file (A4); giá trị khác bị báo lỗi | lang, language, ngôn ngữ, sprache |
| `pos` | Không | Loại từ: `noun`, `verb`, `adj`… (chuỗi tự do) | pos, part of speech, wortart, loại từ, từ loại |
| `meaning` | Không | Nghĩa (tiếng Anh hoặc tiếng Việt đều lưu được). Nhiều nghĩa cách nhau bằng `;` | meaning, meanings, definition, translation, bedeutung, nghĩa, dịch |
| `lesson` | Không | Tên bài (chủ đề, vd `Family`). Nhập file tìm bài cùng tên trong deck của từ (không phân biệt hoa/thường) hoặc tạo mới, theo thứ tự trong file; cũng dùng để lọc ở bước duyệt (A1d) | lesson, chapter, unit, lektion, bài, chương |
| `deck` | Không | Tên deck. Nhiều deck cách nhau bằng `;`. Tên chưa có thì tạo mới, khớp deck theo tên không phân biệt hoa/thường, trong cùng ngôn ngữ | deck, decks, set, sets, wordset, collection, topic, bộ, bộ từ, chủ đề |
| `example` | Không | Câu hoặc cụm ví dụ. Trống thì app tạo example tối thiểu (chính `text`, C4) | example, sentence, beispiel, ví dụ, câu, câu ví dụ |
| `highlight` | Không | Đoạn đúng trong `example` cần tô sáng, dùng khi dạng trong câu khác `text` (vd `swallowed` so với `swallow`). **Cụm bị tách (động từ tách) viết các đoạn cách nhau bằng `…` hoặc `...`**, theo thứ tự xuất hiện trong câu: `fahren … ab` | highlight, tô sáng |
| `gender` | Không | Giống danh từ tiếng Đức: `der`/`die`/`das` hoặc `m`/`f`/`n` (cũng nhận masc, fem, neut…). Giá trị lạ bị báo lỗi | gender, genus, artikel, article, giống |
| `plural` | Không | Dạng số nhiều **đầy đủ** của tiếng Đức (`Adressen`, `Äpfel`), không phải hậu tố (`-en`): bài giống/số nhiều lấy đúng chuỗi này làm đáp án | plural, số nhiều |
| `infinitiv` | Không | Dạng nguyên mẫu (động từ Đức) | infinitiv, infinitive |
| `praesens3sg` | Không | Präsens ngôi er/sie/es (`fährt ab`). Cần cho bài chia động từ hỏi động từ đổi thân âm (`fahren`, `essen`); thiếu cột này thì bài chỉ hỏi được động từ yếu theo quy tắc | praesens3sg, präsens3sg, praesens er/sie/es, präsens er/sie/es, er/sie/es, 3sg |
| `praeteritum` | Không | Dạng Präteritum | praeteritum, präteritum, preterite, past |
| `partizip2` | Không | Dạng Partizip II | partizip2, partizip ii, partizip 2, past participle |
| `tone` | Không | Mức trang trọng, giá trị thuộc bộ PVO (mục 1.3) | tone |
| `mode` | Không | Nói hay viết, thuộc bộ PVO | mode |
| `register` | Không | Lĩnh vực, thuộc bộ PVO | register |
| `nuance` | Không | Sắc thái, thuộc bộ PVO | nuance |
| `dialect` | Không | Phương ngữ, thuộc bộ PVO | dialect |
| `note` | Không | Ghi chú của example (vd ghi "slang" ở đây) | note, notes, ghi chú |

### 12.3 Quy tắc kiểm tra và xử lý
- **TMRND:** giá trị phải thuộc bộ đang cấu hình trong Cài đặt (mặc định là bộ PVO ở mục 1.3), không phân biệt hoa/thường; app ghi lại đúng chữ chuẩn. Giá trị lạ làm dòng đó **lỗi** (không tự thêm giá trị mới). Nhãn từ file đặt `verified` (PO đã tự soạn), nội dung từ và nghĩa vẫn `unverified`.
- **Tô sáng:** nếu có `highlight` thì tìm nó trong `example` (không phân biệt hoa/thường); không thấy thì cảnh báo và quay về tìm `text`. Không thấy cả hai thì cảnh báo "cần tô sáng tay" và PO tô ở bước duyệt. Mỗi example một cụm tô sáng. **Cụm bị tách:** `highlight` có dấu `…`/`...` được cắt thành các đoạn; mỗi đoạn được tìm **sau đoạn trước** trong câu. Đoạn nào không thấy hoặc sai thứ tự thì cảnh báo "không có trong câu ví dụ theo đúng thứ tự" và dòng chuyển sang tô sáng tay.
- **Lỗi so với cảnh báo:** *lỗi* (thiếu `text`, `lang` sai, nhãn ngoài bộ, `gender` lạ) loại dòng đó khỏi lần nhập và báo theo số dòng (dòng tiêu đề là dòng 1). *Cảnh báo* (không tìm thấy cụm để tô sáng) vẫn cho nhập.
- **Trùng:** cùng ngôn ngữ + `text` (+ loại từ) với concept đã có thì chọn bỏ qua, gộp thêm example, hoặc cập nhật (A1c). Từ đã `acquired` tự ẩn ở bước duyệt (A6). Từ đã có vẫn được thêm vào `deck` của file kể cả khi chọn bỏ qua.
- **Deck đích:** ngoài cột `deck`, PO có thể chọn một deck có sẵn (cùng ngôn ngữ) hoặc "+ Tạo deck mới…" để thêm cả file vào.
- **Chưa có trong file:** liên kết concept–concept và example–concept (PO tạo trong app, mục 9.2 câu 4); câu thuộc đoạn văn đục lỗ; lịch ôn.
- Lần nhập gần nhất hoàn tác được; app không lưu file gốc (A7).

### 12.4 Ví dụ (file mẫu của PO, từ vựng Goethe A1)

| text | lang | pos | meaning | lesson | deck | example | highlight | gender | plural | infinitiv | praesens3sg | praeteritum | partizip2 | tone | mode | register | nuance | dialect | note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Adresse | de | Noun | address | Person | Goethe A1 | Können Sie mir seine Adresse sagen? | Adresse | die | Adressen | | | | | | | | | | |
| abfahren | de | Verb | to depart | Travel & Transport | Goethe A1 | Wir fahren um zwölf Uhr ab. | fahren … ab | | | abfahren | fährt ab | fuhr ab | ist abgefahren | | | | | | die Abfahrt |
| groß | de | Adjective | tall, big | Person | Goethe A1 | Mein Bruder und ich sind gleich groß. | groß | | | | | | | | | | | | größer – am größten; die Größe |

- Dòng 1 (*Adresse*): danh từ kèm giống `die` và số nhiều **đầy đủ** `Adressen` (bài giống/số nhiều hỏi đúng dạng này); `highlight` trùng `text` nên có thể bỏ trống.
- Dòng 2 (*abfahren*): động từ tách (trennbar), bốn dạng `infinitiv`/`praesens3sg`/`praeteritum`/`partizip2` cho bài chia động từ và bài động từ bất quy tắc; danh từ gốc ghi ở `note`. `highlight` = `fahren … ab` là cụm tách: app tô sáng `fahren` và `ab` trong câu (xem 12.5).
- Dòng 3 (*groß*): tính từ; so sánh hơn/nhất và danh từ gốc ghi ở `note`.
- Cột nhãn TMRND để trống thì example chưa có nhãn (`empty`), PO gắn sau ở màn sửa example.

### 12.5 Điểm cần lưu ý với file mẫu này
- **Động từ tách (v12):** cột `highlight` ghi các đoạn của cụm cách nhau bằng `…` (hoặc `...`), theo đúng thứ tự trong câu: `fahren … ab` tô sáng `fahren` và `ab`. Trong app, ở màn sửa example và các màn thêm example: tô đoạn đầu, bấm **Tô thêm đoạn nữa** cho đoạn sau. Cụm tách chỉ là một cụm của một example (không thành hai example). Bài đang hỗ trợ: điền cụm vào câu tiếng Anh (`en.cloze`, mỗi đoạn một ô), nghe chép (chép các đoạn nối bằng khoảng trắng: `fahren ab`). Bài đục lỗ đoạn văn vẫn mỗi lỗ một đoạn liền.
- **Số nhiều:** ghi **dạng đầy đủ** (`Adressen`), không ghi hậu tố (`-en`); app lưu nguyên chuỗi và dùng làm đáp án của bài giống/số nhiều. Vì vậy một ô `-en` sẽ bị coi là sai thay vì được suy ra.
- **Nghĩa tiếng Anh:** với từ vựng tiếng Đức, cột `meaning` ghi tiếng Anh (`address`, `to depart`) là đúng ý; bài tiếng Đức không dùng cột này. Nghĩa chỉ là thông tin tham khảo, không phải đáp án.
- **`pos`:** `Noun`/`Verb`/`Adjective` viết hoa vẫn được nhận (chuỗi tự do).
- **Xuất xlsx dùng cùng bộ cột** (E3) để xuất rồi nhập lại được; riêng cột nhãn TMRND chỉ xuất nhãn đã `verified`.

---

## 13. Lịch sử thay đổi

**v12 (bản này):**
- **Màn Đoạn văn theo deck** (Bản 6): card deck trước, đọc danh sách đoạn văn khi bấm card; `Passage.setId`; schema v9 (chỉ mục `examples.passageId`); v10 gán deck cho đoạn văn cũ; sửa đoạn văn đổi được deck.
- **Mục 12 Format input file** (cột, quy tắc, ví dụ từ file mẫu Goethe A1 của PO).
- **Cụm tô sáng nhiều đoạn** cho động từ tách (`Example.highlightExtra`, không cần migration): nhập file bằng `fahren … ab`, nút "Tô thêm đoạn nữa", bài điền cụm tiếng Anh và nghe chép, xuất xlsx giữ nguyên cách ghi (C7, 9.2 câu 2, mục 12).
- **Kế hoạch Bản 8** (mục 10): bài (lesson) là đối tượng có tên nằm trong deck, chọn bằng hộp chọn; ôn tập, học và Thư viện theo bài; các bước M15a–M15f.
- **Kế hoạch Bản 7** (mục 10): nhập tay và nhập file tiếng Đức cho cùng dạng dữ liệu; màn hình hiện và sửa được mọi thông tin của file; loại từ ở màn Thêm word là hộp chọn.
- **Bài điền đoạn văn phải làm lại khi dưới ngưỡng đạt** (mặc định 90%, tối đa 2 lần làm lại; chỉnh ở Cài đặt → Học).

**v11:**
- **Học theo đoạn văn đục lỗ** (Bản 6): bảng `passages` (schema v7), `Example.passageId`, bài `en/de.passage-cloze`, màn Thêm đoạn văn và Đoạn văn.
- **Nút (+) tách ba thao tác** Thêm từ / Thêm example / Thêm concept (mục 1.4, A5, Bản 5); thêm `Concept.kind` (word/concept, tùy chọn, không migration). "Thêm concept" không còn tạo example tối thiểu.
- **Deck General** mặc định và **Thư viện theo card deck → card con Word/Concept → danh sách**, chỉ tải khi bấm (C6, Bản 5).
- **Chấm nhập chính tả không phân biệt hoa/thường** cho cả tiếng Đức (mục 5.2).
- **Chọn giọng đọc** trong Cài đặt + tự xếp hạng giọng (C5).
- **Tìm kiếm chỉ chạy khi bấm Enter/"Tìm"** (F1).

**v10:**
- Ghi nhận M12a–d đã xong, lối vào sửa example từ Hộp chờ, Tìm theo liên kết kèm đồ thị (R7).
- Thêm **Deck** (`WordSet`, schema v6; mục C6, 9.2 câu 6 và "Bản 4" ở mục 10), M13a và M13b.
- Thêm **quy ước phản hồi giao diện** (mục 10): badge thay `confirm()`, ô xác nhận xóa tại chỗ kèm Hoàn tác, lưu xong báo và chuyển trang, hover/focus cho mọi control.
- Hoãn: lỗi "không kết nối được dịch vụ tra cứu" trên máy PO (mã không đổi, Chrome sạch gọi được dịch vụ; nghi mạng hoặc tiện ích chặn tên miền); đề xuất nguồn dự phòng en.wiktionary, chưa làm.

**v9:**
- Thêm mục "Bản 3b" (mục 10): quy luật R1–R8 rút từ toàn bộ 40 ảnh `docs/reference/hustpvo`, ba quyết định của PO (gộp thành một danh sách liên kết ở giao diện, thứ tự làm, bố cục điện thoại) và kế hoạch M12a–M12d, trong đó M12a là căn chỉnh nút/khoảng cách toàn app.

**v8:**
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
