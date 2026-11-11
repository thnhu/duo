"""Bước 1 của quy trình nhập từ vựng hàng loạt (không dùng AI, hoàn toàn tất định).

Đọc list.txt (nhóm lớn "1. ...", nhóm giữa là dòng không có dấu ':', concept là
"tên: nghĩa") và ghi concepts.json. Không bịa gì: chỉ tách chữ có sẵn trong list.

    python tools/vocab-import/parse_list.py [list.txt] [concepts.json]
"""
import json
import re
import sys
from pathlib import Path

here = Path(__file__).parent
src = Path(sys.argv[1]) if len(sys.argv) > 1 else here / 'list.txt'
dst = Path(sys.argv[2]) if len(sys.argv) > 2 else here / 'concepts.json'

BIG = re.compile(r'^(\d+)\.\s+(.+)$')
SENTENCE = re.compile(r'\s*Câu\s*[“"](.+?)[”"]\s*là example của concept này\.?\s*$')
PAREN_NOTE = re.compile(r'\s*\((trong list là [^)]*)\)\s*$')
TYPE_FLAG = re.compile(r'\s*\(T\)\s*')  # PO: bỏ qua ký hiệu này

big = None
mid = None
groups = {}      # tên nhóm -> {"parent": tên nhóm lớn hoặc None}
concepts = []
unsure = []

for raw in src.read_text(encoding='utf-8').splitlines():
    line = raw.strip()
    if not line:
        continue
    m = BIG.match(line)
    if m:
        big, mid = m.group(2).strip(), None
        groups[big] = {'parent': None}
        continue
    if ':' not in line:
        mid = line
        groups[mid] = {'parent': big}
        continue

    name, rest = line.split(':', 1)
    name = TYPE_FLAG.sub(' ', name).strip()
    rest = rest.strip()
    given = []
    s = SENTENCE.search(rest)
    if s:
        given.append(s.group(1).strip())
        rest = rest[: s.start()].strip()
    note = None
    p = PAREN_NOTE.search(rest)
    if p:
        note = p.group(1)
        rest = rest[: p.start()].strip()
    rest = rest.rstrip('.').strip()

    flags = []
    if rest.startswith('chưa chắc'):
        flags.append('nghĩa chưa chắc: cần PO xác nhận, không sinh example')
        unsure.append(name)
    for g in given:
        if g.endswith('…') or g.endswith('...'):
            flags.append('câu PO đưa bị cắt (kết thúc bằng …): giữ nguyên, không tự bổ sung')

    concepts.append({
        'text': name,
        'meaning': '' if flags and flags[0].startswith('nghĩa chưa chắc') else rest,
        'rawMeaning': rest,
        'group': mid or big,       # cha trực tiếp
        'big': big,
        'givenExamples': given,
        'note': note,
        'needsPO': flags,
    })

out = {'groups': groups, 'concepts': concepts}
dst.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(groups)} nhóm, {len(concepts)} concept, {sum(1 for c in concepts if c["givenExamples"])} có câu sẵn, {len(unsure)} cần PO xác nhận')
