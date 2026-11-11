# Luật sinh example (bản chép từ skill pvo-vocab-examples, dùng khi chạy hàng loạt)

## Mô hình
- **Concept** = từ hoặc cụm tiếng Anh + nghĩa tiếng Việt. Một concept có 3 example.
- **Example** = một câu / cách diễn đạt. Ba example của một concept là ba cách nói cùng nghĩa
  ở ba tone (informal, neutral, formal) hoặc ba tình huống. Mỗi example **tô sáng một cụm khác nhau**
  (cụm tô sáng là chữ nằm đúng trong câu, có thể là dạng chia: defeat → "defeated").
- **Cụm tô sáng của mỗi example sẽ thành một Word** (PVO tự tạo khi nhập). Nên chọn cụm đáng học (collocation, idiom, dạng chia), và mỗi example phải kèm `highlight_meaning` = nghĩa tiếng Việt của đúng cụm đó. Cụm trùng tên concept hoặc cụm ngắt quãng thì không tạo Word.
- Mỗi example mang đủ 5 nhãn TMRND: Tone, Mode, Register, Nuance, Dialect.

## Bộ giá trị (mỗi ô một giá trị, đúng chính tả)
- Tone: Neutral, Informal, Formal, Slightly informal, Slightly formal
- Mode: Neutral, Spoken, Written
- Register: Neutral, Academic, Literature, Business, Law, Journalism, Medicine, IT, Other
- Nuance: Neutral, Old fashioned, Humorous, Oft positive, Oft negative
- Dialect: Neutral, American, British, Other
- Nhãn ngoài bộ (slang, v.v.) ghi vào `note`, không thêm giá trị mới. Register/Dialect = Other thì giải thích ở `note`.

## Quy tắc
1. Ba example theo ba tone/tình huống. Nếu nghĩa không có đủ ba cách nói tự nhiên, **đưa ít hơn và điền `fewer_reason`**; không bịa cho đủ.
2. **Không rập khuôn.** Register, Mode, Nuance, Dialect theo từ điển và cách dùng thực. Không mặc định "formal = Academic". Đa dạng ngữ cảnh.
3. Câu ngắn, tự nhiên. Bám chủ đề của nhóm (chiến tranh, chính trị…) khi hợp lý, nhưng đời thường nếu tự nhiên hơn.
4. Ba cách nói không đồng nghĩa hoàn toàn thì ghi chênh lệch vào `note`.
5. Từ đa nghĩa: chỉ làm đúng nghĩa trong danh sách.
6. Câu PO đã đưa (`givenExamples`): dùng **nguyên văn**, làm một trong ba example, không viết lại, không bổ sung phần bị cắt (…). Chỉ sinh thêm các example còn thiếu.
7. Nhãn nào không có nguồn từ điển thì đặt `unchecked: true` (script ghi `[chưa kiểm]` vào note). Ưu tiên nhãn từ điển học: Oxford Learner's, Merriam-Webster Learner's.
8. Tri-fold chỉ đếm tổ hợp nhãn **khác nhau**; ba example trùng cả năm nhãn thì không có giá trị học.

## Ngân sách tìm kiếm (chạy hàng loạt)
- Tối đa **1 tìm kiếm cho mỗi concept**, và chỉ khi nhãn tone/register còn tranh cãi hoặc cụm hiếm/idiom/phương ngữ.
- Từ phổ biến mà nhãn chắc chắn thì không cần tìm, nhưng đặt `unchecked: true` nếu thật sự chưa kiểm.
- Ưu tiên domain oxfordlearnersdictionaries.com và merriam-webster.com.
- Không liệt kê nguồn thừa; trong báo cáo cuối chỉ nêu concept nào đã tìm, concept nào chưa kiểm.
