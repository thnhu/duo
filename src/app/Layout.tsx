import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import styles from './Layout.module.css';

function navLinkClass({ isActive }: { isActive: boolean }) {
  return [styles.navItem, isActive && styles.navItemActive].filter(Boolean).join(' ');
}

// A new page always starts at its top (the window scrolls, and a route change
// would otherwise keep the old scroll position, e.g. after saving a long form).
function useScrollToTopOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
}

export function Layout() {
  useScrollToTopOnNavigate();
  return (
    <div className={styles.shell}>
      <main className={styles.content}>
        <Outlet />
      </main>

      <NavLink to="/add" className={styles.fab} aria-label="Thêm concept hoặc example">
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
