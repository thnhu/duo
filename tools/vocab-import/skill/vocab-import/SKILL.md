---
name: vocab-import
description: Nhận một danh sách concept tiếng Anh đã phân nhóm (nhóm lớn > nhóm giữa > concept kèm nghĩa), sinh 3 example kèm nhãn TMRND cho từng concept, tự kiểm bằng script, rồi xuất file CSV đúng template để nhập hàng loạt vào tool PVO (màn /import). Dùng khi người dùng có CẢ DANH SÁCH và muốn nhập lên PVO. Luôn hỏi người dùng deck (bắt buộc) và lesson (tùy chọn) TRƯỚC khi làm gì khác. Một concept lẻ cần tra cứu thì dùng skill pvo-vocab-examples, không dùng skill này.
---

# vocab-import: danh sách concept → file nhập PVO

Đầu ra là **một file CSV** để người dùng nhập ở màn **/import** của PVO. Skill này không tự nhập vào app và không dùng khóa API nào.

## Việc skill này làm
0. Hỏi deck (bắt buộc) và lesson (tùy chọn) trước tiên.
0b. Mọi concept phải có **nghĩa tiếng Việt** (lấy từ danh sách của người dùng, ví dụ `a land battle: trận đánh trên bộ`). Trong PVO, tên concept là `a land battle`; phần "trận đánh trên bộ" đi vào cột `meaning` và hiện ngay dưới tên concept ở Thư viện (ô "Mô tả" ở chi tiết concept) để người dùng biết nó nghĩa gì. Thiếu nghĩa thì script báo lỗi; không tự đoán nghĩa, hỏi người dùng.
1. Tách danh sách thành cây nhóm + concept bằng script (không dùng AI).
2. Sinh 3 example cho từng concept theo `references/example-rules.md`.
3. Kiểm bằng `scripts/build_import.py` rồi sửa cho đến khi hết lỗi.
4. Giao CSV + báo cáo ngắn.

## Định dạng danh sách đầu vào
- Dòng `1. Tên nhóm lớn` mở một nhóm lớn.
- Dòng không có dấu `:` là tên nhóm giữa.
- Dòng `tên concept: nghĩa tiếng Việt` là một concept. Concept ở ngay dưới nhóm lớn (không có nhóm giữa) thì cha là nhóm lớn.
- Ghi chú trong ngoặc như `(trong list là defeated)` được bỏ khỏi nghĩa; ký hiệu `(T)` bị bỏ.
- Câu người dùng đưa kèm: `Câu “…” là example của concept này.` → giữ nguyên văn làm một trong ba example.
- Nghĩa `chưa chắc…` → **không sinh example**, nêu lại trong báo cáo để người dùng xác nhận.
- Xem ví dụ ở `examples/sample-list.txt`.

## Quy trình (làm đúng thứ tự)

### 0. Hỏi TRƯỚC KHI làm bất cứ việc gì
Ngay khi nhận danh sách, **dừng lại và hỏi người dùng** (một tin nhắn, chưa chạy script nào, chưa sinh gì):
1. **Danh sách này thuộc deck nào?** (bắt buộc). Xin tên đúng như đã có trong PVO, vì PVO khớp deck theo tên (không phân biệt hoa thường); gõ khác tên thì PVO tạo thêm một deck mới.
2. **Thuộc lesson nào?** (tùy chọn; người dùng có thể bỏ qua, khi đó để trống).
Chỉ bắt đầu bước 1 sau khi có câu trả lời. Không tự đặt tên deck, không đoán từ nội dung danh sách. Tên deck và lesson được điền vào mọi dòng của file (`--deck`, `--lesson`). Người dùng đã nêu sẵn deck/lesson trong tin nhắn đầu thì không hỏi lại, chỉ nhắc lại để xác nhận.

### 1. Phân tích danh sách
Lưu danh sách người dùng dán thành `list.txt`, rồi:
```
python scripts/parse_list.py list.txt concepts.json
```
Đọc dòng tóm tắt (số nhóm, concept, concept có câu sẵn, concept cần xác nhận). Nếu số liệu lệch với danh sách, kiểm tra lại cách chia nhóm trước khi sinh gì.

### 2. Sinh example
Đọc `references/example-rules.md`. Với mỗi concept (trừ concept chờ xác nhận), viết 3 example vào `examples.json` theo mẫu ở đầu `scripts/build_import.py`. Điểm bắt buộc:
- Câu đã có sẵn từ người dùng dùng nguyên văn.
- Highlight là chữ nằm nguyên văn trong câu.
- Đủ 5 nhãn, đúng bộ giá trị. Nhãn chưa kiểm bằng từ điển → `unchecked: true`.
- Không đủ 3 cách nói tự nhiên thì ít hơn và ghi `fewer_reason`. **Không bịa để đủ số lượng.**
- Tối đa 1 lần tìm kiếm cho mỗi concept, chỉ khi cần (xem ngân sách trong file luật).
- **Mỗi cụm tô sáng sẽ được PVO ngầm tạo thành một Word để học sau** (cùng deck/lesson với concept, giữ bản sao câu ví dụ). Vì vậy mỗi example phải có `highlight_meaning`: nghĩa tiếng Việt ngắn của đúng cụm đó trong câu (ví dụ cụm "sworn enemy" → "kẻ thù không đội trời chung"). Không bịa: cụm hiếm thì tra một lần hoặc đánh dấu `unchecked`. Cụm trùng đúng tên concept (debate → "debate") hoặc cụm ngắt quãng `a … b` thì không tạo Word, không cần `highlight_meaning`.
- Chọn cụm tô sáng là **cụm đáng học thành một Word** (có thể là dạng chia, collocation, idiom), không phải cả mệnh đề.
Làm theo lô (khoảng 10 concept một lô) nếu danh sách dài, nhưng gộp tất cả vào một `examples.json`.

### 3. Kiểm và xuất
```
python scripts/build_import.py concepts.json examples.json pvo-import.csv --deck "<tên deck>" [--lesson "<lesson>"]
```
Có **LỖI** thì sửa `examples.json` và chạy lại cho đến khi hết lỗi (script không ghi file khi còn lỗi). **CẢNH BÁO** thì đọc và quyết định sửa hay nêu trong báo cáo. Không chuyển giao file khi chưa chạy thành công lần cuối.

### 4. Giao kết quả
Đưa file CSV (và `examples.json` nếu người dùng muốn rà lại) kèm báo cáo gồm:
- Số nhóm / concept / example đã tạo, và số Word sẽ được tạo từ cụm tô sáng (script in dòng "PVO sẽ ngầm tạo tối đa N Word").
- Concept chờ người dùng xác nhận (nghĩa chưa chắc), concept dưới 3 example kèm lý do.
- Concept nào đã tra từ điển, concept nào nhãn `[chưa kiểm]`.
- Hướng dẫn nhập: mở PVO → **Nhập từ file** (`/import`) → chọn file → cột tự khớp → xem bước duyệt → nhập. File có thể nhập lại an toàn (nhập lại không nhân đôi; có Hoàn tác lần nhập gần nhất).

## Cam kết chống bịa
- Không thêm concept, nhóm, nghĩa, hay quan hệ ngoài danh sách.
- Quan hệ giữa concept → nhóm giữa → nhóm lớn luôn là `association`, không tự suy `typeOf`.
- Không sửa câu người dùng đưa; không bổ sung phần bị cắt.
- Nhãn lưu vào file sẽ được PVO coi là đã duyệt (`verified`) và dùng làm đáp án chấm điểm. Vì vậy nhãn chưa chắc phải mang `[chưa kiểm]` trong `note`, và báo cáo phải nói rõ để người dùng rà trước khi nhập.

## Giới hạn
- Script kiểm tái hiện luật nhập file của PVO, không phải chính code của app. Bước duyệt ở /import vẫn là lớp kiểm cuối.
- Chỉ dùng cho tiếng Anh (lang `en`). Từ tiếng Đức cần cột ngữ pháp riêng nên không thuộc skill này.
