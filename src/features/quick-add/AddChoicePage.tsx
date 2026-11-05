import { Link } from 'react-router-dom';
import styles from './AddChoicePage.module.css';

// The (+) button lands here. Three different things can be added, kept apart
// (HUST PVO likewise separates Concept and Example):
//   Word    = a word/phrase on its own with its meaning, no sentence needed;
//   Example = one way of saying something, in a sentence (highlight the phrase);
//   Concept = an idea, a node to sort and search by, with no wording yet.
export function AddChoicePage() {
  return (
    <section className={styles.page}>
      <h1>Bạn muốn thêm gì?</h1>

      <Link to="/add/word" className={styles.choice}>
        <span className={styles.title}>Thêm từ</span>
        <span className={styles.what}>Một từ hoặc cụm từ đứng riêng, kèm nghĩa. Không cần câu.</span>
        <span className={styles.eg}>Hợp với danh từ: máy bay, cửa sổ, window, der Apfel</span>
        <span className={styles.go}>Gõ từ và nghĩa, xong →</span>
      </Link>

      <Link to="/add/example" className={styles.choice}>
        <span className={styles.title}>Thêm example</span>
        <span className={styles.what}>Một câu hoặc cách diễn đạt đang dùng, tô sáng cụm cần học.</span>
        <span className={styles.eg}>Hợp với động từ: "She swallowed the pill.", a bunch of</span>
        <span className={styles.go}>Gắn vào một concept (có sẵn hoặc tạo mới) →</span>
      </Link>

      <Link to="/add/concept" className={styles.choice}>
        <span className={styles.title}>Thêm concept</span>
        <span className={styles.what}>Một ý để gom các cách nói lại, chưa cần có từ cụ thể.</span>
        <span className={styles.eg}>Ví dụ: "số lượng nhiều", "chào hỏi"</span>
        <span className={styles.go}>Gõ tên ý, thêm cách nói sau →</span>
      </Link>

      <p className={styles.note}>
        Từ và concept đều nằm trong deck. Example mang nhãn Tone/Mode/Register/Nuance/Dialect và là đơn vị được
        ôn tập; từ thêm riêng tự có một example tối thiểu (chính nó) để ôn được.
      </p>
    </section>
  );
}
