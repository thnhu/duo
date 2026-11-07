import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SearchLink } from '../../ui/SearchLink';
import { countDueWords } from '../../exercises/review';
import { defaultStudySettings, loadStudy } from '../../settings/study';
import type { WordSet } from '../../db/types';
import { effectiveLessonIds, listLessonGroups, type LessonGroup } from '../../lessons';
import { listWordSets, readStudySets, writeStudySets } from '../../wordsets';
import { LessonChips } from '../lessons/LessonChips';
import type { SessionConfig } from '../learn/LearnPage';
import { SetChips } from '../sets/SetChips';
import styles from './TodayPage.module.css';

export function TodayPage() {
  const navigate = useNavigate();
  const [due, setDue] = useState<number | null>(null);
  const [count, setCount] = useState(defaultStudySettings.sessionCount);
  const [sets, setSets] = useState<WordSet[]>([]);
  const [setIds, setSetIdsState] = useState<string[] | null>(null);
  const [lessonGroups, setLessonGroups] = useState<LessonGroup[]>([]);
  const [pickedLessons, setPickedLessons] = useState<string[]>([]);

  // Sets of both languages; the choice is remembered on this device.
  useEffect(() => {
    void Promise.all([listWordSets('en'), listWordSets('de')]).then(([en, de]) => {
      const all = [...en, ...de];
      const live = new Set(all.map((s) => s.id));
      setSets(all);
      setSetIdsState(readStudySets('duo:today-sets').filter((id) => live.has(id)));
    });
  }, []);

  function chooseSets(ids: string[]) {
    writeStudySets('duo:today-sets', ids);
    setSetIdsState(ids);
  }

  // Lessons of the ticked decks (or of every deck, both languages).
  useEffect(() => {
    if (setIds === null) return;
    let current = true;
    void listLessonGroups(['en', 'de'], setIds, sets).then((groups) => {
      if (!current) return;
      setLessonGroups(groups);
      setPickedLessons(readStudySets('duo:today-lessons'));
    });
    return () => {
      current = false;
    };
  }, [setIds, sets]);

  function chooseLessons(ids: string[]) {
    writeStudySets('duo:today-lessons', ids);
    setPickedLessons(ids);
  }

  // A tick whose lesson is no longer offered does not filter.
  const lessonIds = effectiveLessonIds(pickedLessons, lessonGroups);

  useEffect(() => {
    if (setIds === null) return;
    let current = true;
    setDue(null);
    void countDueWords(Date.now(), setIds, lessonIds).then((n) => {
      if (current) setDue(n);
    });
    return () => {
      current = false;
    };
  }, [setIds, lessonIds.join(',')]);

  useEffect(() => {
    let current = true;
    void loadStudy().then((study) => {
      if (current) setCount(study.sessionCount);
    });
    return () => {
      current = false;
    };
  }, []);

  function start(kind: 'review' | 'flash') {
    const config: SessionConfig = { kind, count, setIds: setIds ?? [], lessonIds, options: {} };
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

      {sets.length > 0 && setIds !== null && (
        <Card className={styles.card}>
          <h2>Deck cần ôn</h2>
          <SetChips sets={sets} selected={setIds} onChange={chooseSets} showLang />
        </Card>
      )}

      {lessonGroups.length > 0 && setIds !== null && (
        <Card className={styles.card}>
          <h2>Lesson cần ôn</h2>
          <LessonChips groups={lessonGroups} selected={pickedLessons} onChange={chooseLessons} showLang />
        </Card>
      )}

      <Card className={styles.card}>
        <h2>Ôn tập</h2>
        {due === null ? (
          <p>Đang kiểm tra…</p>
        ) : due > 0 ? (
          <>
            <p>
              <strong>{due}</strong> concept đến hạn ôn hôm nay.
            </p>
            <Button onClick={() => start('review')}>Ôn tập</Button>
          </>
        ) : (
          <p>
            {(setIds && setIds.length > 0) || lessonIds.length > 0
              ? 'Hôm nay không có concept nào trong các deck và lesson đã chọn cần ôn.'
              : 'Hôm nay không có gì cần ôn. Học bài mới hoặc luyện phản xạ chớp nhoáng nhé.'}
          </p>
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
