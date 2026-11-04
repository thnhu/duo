import { Link } from 'react-router-dom';
import styles from './SearchLink.module.css';

// Top-bar magnifier (DESIGN.md 5.4) opening the global search screen (F1).
export function SearchLink() {
  return (
    <Link to="/search" className={styles.link} aria-label="Tìm kiếm">
      🔍
    </Link>
  );
}
