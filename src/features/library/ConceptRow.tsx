import { Link } from 'react-router-dom';
import { Card } from '../../ui/Card';
import type { Concept } from '../../db/types';
import styles from './LibraryPage.module.css';

// One concept in a Library list (a sub deck or a lesson).
export function ConceptRow({ concept }: { concept: Concept }) {
  return (
    <Link to={`/library/${concept.id}`} className={styles.rowLink}>
      <Card className={styles.row}>
        <span>
          <div className={styles.rowText}>{concept.text}</div>
          {concept.meanings[0] && <div className={styles.rowMeaning}>{concept.meanings[0]}</div>}
        </span>
        <span
          className={[styles.badge, concept.status === 'acquired' && styles.badgeAcquired].filter(Boolean).join(' ')}
        >
          {concept.mode === 'depth' ? 'Sâu' : concept.status === 'acquired' ? 'Đã thụ đắc' : 'Đang học'}
        </span>
        {concept.lookup?.status === 'found' && concept.verification === 'unverified' && (
          <span className={styles.badge}>Có gợi ý</span>
        )}
      </Card>
    </Link>
  );
}
