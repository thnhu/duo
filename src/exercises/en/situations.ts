import type { ExampleAttributes } from '../../db/types';

// Situations for the depth drill "choose the way of saying it that fits"
// (S2, spec 5.2). One short Vietnamese scene per TMRND value, as plain
// configuration (not hard-coded in the drill): a value with no entry here
// (for example "Other", which PO explains in a note) is simply never used to
// set a scene. Values come from the default PVO sets.

export type AttributeKey = keyof ExampleAttributes;

// Order in which the drill prefers to build a scene from. A scene about
// formality is the clearest, so Tone comes first.
export const SCENE_ATTRIBUTE_ORDER: AttributeKey[] = ['tone', 'register', 'mode', 'nuance', 'dialect'];

export const ATTRIBUTE_TITLE: Record<AttributeKey, string> = {
  tone: 'Tone',
  mode: 'Mode',
  register: 'Register',
  nuance: 'Nuance',
  dialect: 'Dialect',
};

export const SITUATIONS: Record<AttributeKey, Record<string, string>> = {
  tone: {
    Neutral: 'Một tình huống bình thường, không đặc biệt trang trọng cũng không suồng sã.',
    Informal: 'Bạn đang nhắn tin hoặc nói chuyện thoải mái với bạn thân.',
    Formal: 'Bạn đang viết thư hoặc email cho người cần giữ sự trang trọng (cấp trên, giáo sư).',
    'Slightly informal': 'Bạn đang nói chuyện thân thiện với đồng nghiệp đã quen.',
    'Slightly formal': 'Bạn đang nói chuyện lịch sự với người mới quen.',
  },
  mode: {
    Neutral: 'Một tình huống không thiên về nói hay viết.',
    Spoken: 'Bạn đang nói trực tiếp trong một cuộc trò chuyện.',
    Written: 'Bạn đang viết (thư, bài đăng, văn bản).',
  },
  register: {
    Neutral: 'Một tình huống đời thường, không thuộc lĩnh vực chuyên môn nào.',
    Academic: 'Bạn đang viết một bài luận hoặc báo cáo học thuật.',
    Literature: 'Bạn đang viết văn, truyện hoặc thơ.',
    Business: 'Bạn đang viết email công việc hoặc báo cáo kinh doanh.',
    Law: 'Bạn đang soạn hợp đồng hoặc văn bản pháp lý.',
    Journalism: 'Bạn đang viết một bài báo.',
    Medicine: 'Bạn đang trao đổi trong bối cảnh y tế.',
    IT: 'Bạn đang viết tài liệu hoặc trao đổi kỹ thuật về công nghệ thông tin.',
  },
  nuance: {
    Neutral: 'Một tình huống bình thường, không cần sắc thái đặc biệt.',
    'Old fashioned': 'Bạn muốn nói theo kiểu cổ, hơi lỗi thời.',
    Humorous: 'Bạn muốn nói đùa, tạo không khí vui.',
    'Oft positive': 'Bạn muốn nói với sắc thái tích cực.',
    'Oft negative': 'Bạn muốn nói với sắc thái tiêu cực.',
  },
  dialect: {
    Neutral: 'Một tình huống không thiên về giọng vùng miền nào.',
    American: 'Bạn đang nói chuyện với một người Mỹ, theo cách nói Mỹ.',
    British: 'Bạn đang nói chuyện theo cách nói Anh.',
  },
};

// The scene for one attribute value, or undefined when there is none.
export function situationFor(key: AttributeKey, value: string): string | undefined {
  return SITUATIONS[key]?.[value];
}
