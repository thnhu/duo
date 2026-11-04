import { NavLink, Outlet } from 'react-router-dom';
import styles from './Layout.module.css';

function navLinkClass({ isActive }: { isActive: boolean }) {
  return [styles.navItem, isActive && styles.navItemActive].filter(Boolean).join(' ');
}

export function Layout() {
  return (
    <div className={styles.shell}>
      <main className={styles.content}>
        <Outlet />
      </main>

      <NavLink to="/quick-add" className={styles.fab} aria-label="Ghi nhanh">
        +
      </NavLink>

      <nav className={styles.nav}>
        <NavLink to="/" end className={navLinkClass}>
          <span className={styles.navIcon}>🏠</span>
          Hôm nay
        </NavLink>
        <NavLink to="/library" className={navLinkClass}>
          <span className={styles.navIcon}>📚</span>
          Thư viện
        </NavLink>
        <NavLink to="/learn" className={navLinkClass}>
          <span className={styles.navIcon}>🎓</span>
          Học
        </NavLink>
      </nav>
    </div>
  );
}
