import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SearchLink } from '../../ui/SearchLink';
import { countDueWords } from '../../exercises/review';
import type { SessionConfig } from '../learn/LearnPage';
import styles from './TodayPage.module.css';

const REVIEW_COUNT = 10;

export function TodayPage() {
  const navigate = useNavigate();
  const [due, setDue] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    void countDueWords().then((n) => {
      if (current) setDue(n);
    });
    return () => {
      current = false;
    };
  }, []);

  function start(kind: 'review' | 'flash') {
    const config: SessionConfig = { kind, count: REVIEW_COUNT, options: {} };
    navigate('/learn/session', { state: config });
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Hôm nay</h1>
        <div className={styles.tools}>
          <SearchLink />
          <Link to="/settings" className={styles.settings} aria-label="Cài đặt">
            ⚙️
          </Link>
        </div>
      </div>

      <Card className={styles.card}>
        <h2>Ôn tập</h2>
        {due === null ? (
          <p>Đang kiểm tra…</p>
        ) : due > 0 ? (
          <>
            <p>
              <strong>{due}</strong> từ đến hạn ôn hôm nay.
            </p>
            <Button onClick={() => start('review')}>Ôn tập</Button>
          </>
        ) : (
          <p>Hôm nay không có gì cần ôn. Học bài mới hoặc luyện phản xạ chớp nhoáng nhé.</p>
        )}
      </Card>

      <Card className={styles.card}>
        <h2>Phản xạ chớp nhoáng</h2>
        <p>Mỗi câu có đồng hồ đếm ngược; hết giờ thì bài tự nộp. Rèn trả lời nhanh, không cần nghĩ.</p>
        <Button variant="secondary" onClick={() => start('flash')}>
          ⚡ Bắt đầu
        </Button>
      </Card>
    </section>
  );
}
