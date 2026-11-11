"""Bước 3: kiểm tra và xuất file nhập cho PVO (/import).

    python build_import.py concepts.json examples.json out.csv --deck "Tên deck" [--lesson "Tên lesson"]

concepts.json do parse_list.py sinh ra. examples.json do Claude viết:

{
  "concepts": [
    {
      "text": "archenemy",
      "examples": [
        {"sentence": "...", "highlight": "...", "highlight_meaning": "nghĩa tiếng Việt của cụm tô sáng",
         "tone": "Informal", "mode": "Spoken",
         "register": "Neutral", "nuance": "Neutral", "dialect": "Neutral", "note": ""}
      ],
      "fewer_reason": "",     # chỉ khi có ít hơn 3 example: lý do (không bịa cho đủ)
      "unchecked": false      # true = nhãn chưa kiểm bằng từ điển -> ghi [chưa kiểm] vào note
    }
  ]
}

Cụm tô sáng của mỗi example được PVO ngầm tạo thành một Word để học sau, nên
`highlight_meaning` (nghĩa tiếng Việt) là bắt buộc, trừ khi cụm trùng đúng tên concept
(khi đó không tạo Word, vì concept đã là chính nó) hoặc là cụm ngắt quãng "a … b".

Các luật dưới đây tái hiện buildRows của app (src/import/build.ts). Nếu app đổi
cột hay bộ nhãn thì phải sửa script này (xem COLUMNS, VALUE_SETS).
Thoát mã 1 nếu còn LỖI; chỉ khi không lỗi mới ghi file.
"""
import argparse
import csv
import json
import sys
from pathlib import Path

# Đúng thứ tự và id của importFields trong src/import/fields.ts.
COLUMNS = [
    'text', 'lang', 'kind', 'pos', 'meaning', 'lesson', 'deck', 'parent', 'relation',
    'example', 'highlight', 'highlightMeaning', 'gender', 'plural', 'infinitiv', 'praesens3sg',
    'praeteritum', 'partizip2', 'tone', 'mode', 'register', 'nuance', 'dialect', 'note',
]

# Bộ giá trị mặc định (src/db/defaults.ts). Nhãn ngoài bộ -> ghi vào note, không thêm giá trị mới.
VALUE_SETS = {
    'tone': ['Neutral', 'Informal', 'Formal', 'Slightly informal', 'Slightly formal'],
    'mode': ['Neutral', 'Spoken', 'Written'],
    'register': ['Neutral', 'Academic', 'Literature', 'Business', 'Law', 'Journalism', 'Medicine', 'IT', 'Other'],
    'nuance': ['Neutral', 'Old fashioned', 'Humorous', 'Oft positive', 'Oft negative'],
    'dialect': ['Neutral', 'American', 'British', 'Other'],
}
LABELS = list(VALUE_SETS)
WANTED = 3


def norm(s):
    return ' '.join((s or '').split())


def find_ci(haystack, needle):
    h, n = haystack.lower(), needle.lower()
    if len(h) != len(haystack) or len(n) != len(needle):
        return -1
    return h.find(n)


def highlight_ok(sentence, highlight):
    """Cụm tô sáng phải nằm trong câu; động từ tách 'a … b' thì từng đoạn theo thứ tự."""
    pieces = [p.strip() for p in highlight.split('…') if p.strip()]
    pos = 0
    for p in pieces:
        at = find_ci(sentence[pos:], p)
        if at == -1:
            return False
        pos += at + len(p)
    return bool(pieces)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('concepts')
    ap.add_argument('examples')
    ap.add_argument('out')
    ap.add_argument('--deck', required=True, help='Tên deck (hỏi người dùng trước khi làm, bắt buộc)')
    ap.add_argument('--lesson', default='')
    args = ap.parse_args()

    if not args.deck.strip():
        print('LỖI: chưa có tên deck. Hỏi người dùng danh sách này thuộc deck nào (và lesson nếu có) rồi chạy lại.')
        sys.exit(1)
    args.deck = args.deck.strip()
    args.lesson = args.lesson.strip()

    parsed = json.loads(Path(args.concepts).read_text(encoding='utf-8'))
    groups = parsed['groups']
    concepts = parsed['concepts']
    got = {c['text'].lower(): c for c in json.loads(Path(args.examples).read_text(encoding='utf-8'))['concepts']}

    errors, warnings = [], []
    rows = []

    def row(**cells):
        return [cells.get(col, '') for col in COLUMNS]

    # --- nhóm: lớn trước, giữa sau; quan hệ luôn association (PO chốt) ---
    seen = set()
    for name, g in groups.items():
        if name.lower() in seen:
            errors.append(f'Nhóm "{name}" trùng tên một nhóm khác.')
        seen.add(name.lower())
    # chu trình trong cây nhóm
    for name in groups:
        cur, hops = name, 0
        while groups.get(cur, {}).get('parent'):
            cur = groups[cur]['parent']
            hops += 1
            if hops > len(groups):
                errors.append(f'Cây nhóm có vòng tròn quanh "{name}".')
                break
    texts = {c['text'].lower() for c in concepts}
    for name in groups:
        if name.lower() in texts:
            errors.append(f'Tên nhóm "{name}" trùng tên một concept.')

    for name, g in groups.items():
        rows.append(row(text=name, lang='en', kind='concept', deck=args.deck, lesson=args.lesson,
                        parent=g['parent'] or '', relation='association' if g['parent'] else ''))

    # --- concept ---
    skipped = []
    stats = {'concepts': 0, 'examples': 0, 'fewer': 0}
    for c in concepts:
        key = c['text'].lower()
        if c.get('needsPO') and any(f.startswith('nghĩa chưa chắc') for f in c['needsPO']):
            skipped.append(c['text'])
            continue
        if not norm(c.get('meaning')):
            errors.append(f'"{c["text"]}": thiếu nghĩa tiếng Việt trong danh sách (concept nào cũng phải có).')
        entry = got.get(key)
        if not entry:
            errors.append(f'Thiếu concept "{c["text"]}" trong examples.json.')
            continue
        exs = entry.get('examples', [])
        if len(exs) == 0:
            errors.append(f'"{c["text"]}": không có example nào.')
            continue
        if len(exs) < WANTED and not norm(entry.get('fewer_reason')):
            errors.append(f'"{c["text"]}": chỉ có {len(exs)} example, cần {WANTED} hoặc ghi fewer_reason (không bịa cho đủ).')
        if len(exs) > WANTED:
            warnings.append(f'"{c["text"]}": có {len(exs)} example (> {WANTED}).')
        if len(exs) < WANTED:
            stats['fewer'] += 1

        sentences = [norm(e.get('sentence', '')) for e in exs]
        # câu PO đưa phải còn nguyên văn
        for given in c.get('givenExamples', []):
            g = norm(given).rstrip('….').strip()
            if not any(s.rstrip('….').strip() == g for s in sentences):
                errors.append(f'"{c["text"]}": câu PO đưa "{given}" bị sửa hoặc mất.')
        if len({s.lower() for s in sentences}) != len(sentences):
            errors.append(f'"{c["text"]}": hai example trùng câu.')

        combos = []
        highlights = []
        for i, e in enumerate(exs, 1):
            tag = f'"{c["text"]}" #{i}'
            s, h = sentences[i - 1], norm(e.get('highlight', ''))
            if not s:
                errors.append(f'{tag}: thiếu câu.')
            if not h:
                errors.append(f'{tag}: thiếu highlight.')
            elif s and not highlight_ok(s, h):
                errors.append(f'{tag}: highlight "{h}" không nằm trong câu (app sẽ đẩy câu vào Hộp chờ).')
            highlights.append(h.lower())
            hm = norm(e.get('highlight_meaning', ''))
            if h and '…' not in h and h.lower() != c['text'].lower() and not hm:
                errors.append(f'{tag}: thiếu highlight_meaning (nghĩa tiếng Việt của "{h}"), vì cụm này sẽ thành một Word.')
            if hm and (h.lower() == c['text'].lower() or '…' in h):
                warnings.append(f'{tag}: highlight_meaning bị bỏ qua vì cụm này không tạo Word.')
            note_bits = []
            if norm(e.get('note')):
                note_bits.append(norm(e['note']))
            labels = {}
            for lab in LABELS:
                v = norm(e.get(lab, ''))
                if not v:
                    errors.append(f'{tag}: thiếu nhãn {lab}.')
                    continue
                canon = next((x for x in VALUE_SETS[lab] if x.lower() == v.lower()), None)
                if not canon:
                    errors.append(f'{tag}: {lab} "{v}" không thuộc bộ ({", ".join(VALUE_SETS[lab])}); ghi vào note thay vì thêm giá trị.')
                else:
                    labels[lab] = canon
            combos.append(tuple(labels.get(l, '') for l in LABELS))
            if entry.get('unchecked'):
                note_bits.append('[chưa kiểm]')
            e['_note'] = ' '.join(note_bits)
            e['_labels'] = labels

        if len(set(combos)) < len(combos):
            warnings.append(f'"{c["text"]}": có example trùng cả 5 nhãn; tri-fold chỉ đếm tổ hợp nhãn khác nhau.')
        if len(set(highlights)) < len(highlights):
            warnings.append(f'"{c["text"]}": hai example tô sáng cùng một cụm (skill yêu cầu mỗi example một cụm khác nhau).')

        parent = c['group']
        for i, e in enumerate(exs):
            rows.append(row(
                text=c['text'], lang='en', kind='concept',
                meaning=c['meaning'],
                deck=args.deck, lesson=args.lesson,
                parent=parent, relation='association',
                example=sentences[i], highlight=norm(e.get('highlight', '')),
                highlightMeaning=norm(e.get('highlight_meaning', '')),
                note=e.get('_note', ''), **e.get('_labels', {}),
            ))
        stats['concepts'] += 1
        stats['examples'] += len(exs)

    extra = set(got) - {c['text'].lower() for c in concepts}
    for k in sorted(extra):
        warnings.append(f'examples.json có concept "{k}" không có trong danh sách: bỏ qua.')

    words = {e['highlight'].lower() for c in concepts if c['text'].lower() in got
             for e in got[c['text'].lower()]['examples']
             if '…' not in e.get('highlight', '') and e.get('highlight', '').lower() != c['text'].lower()}
    print(f'{len(groups)} nhóm, {stats["concepts"]} concept, {stats["examples"]} example, '
          f'{stats["fewer"]} concept dưới {WANTED} example, {len(skipped)} bỏ qua chờ PO.')
    print(f'PVO sẽ ngầm tạo tối đa {len(words)} Word từ các cụm tô sáng (cụm trùng nhau chỉ tính một lần).')
    for s in skipped:
        print(f'  CHỜ PO: "{s}" (nghĩa chưa chắc, không sinh example)')
    for w in warnings:
        print('  CẢNH BÁO:', w)
    for e in errors:
        print('  LỖI:', e)
    if errors:
        print(f'\n{len(errors)} lỗi: sửa examples.json rồi chạy lại. Chưa ghi file.')
        sys.exit(1)

    # UTF-8 có BOM để Excel mở đúng; app tự nhận dấu phân cách và BOM.
    with open(args.out, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, lineterminator='\r\n')
        w.writerow(COLUMNS)
        w.writerows(rows)
    print(f'\nĐã ghi {len(rows)} dòng vào {args.out}')


if __name__ == '__main__':
    main()
