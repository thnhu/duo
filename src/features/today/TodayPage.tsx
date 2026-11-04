import { SearchLink } from '../../ui/SearchLink';
import styles from './TodayPage.module.css';

export function TodayPage() {
  return (
    <section>
      <div className={styles.header}>
        <h1>Hôm nay</h1>
        <SearchLink />
      </div>
      <p>Chưa có gì cần ôn.</p>
    </section>
  );
}
