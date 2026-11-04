import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
// Only the Latin + Vietnamese subsets are loaded (covers en/de/vi, including
// ä/ö/ü/ß) — importing the full font pulls in Cyrillic/Greek/math subsets
// nobody needs, which would bloat the PWA's offline precache for nothing.
import '@fontsource/lora/latin-600.css'
import '@fontsource/lora/vietnamese-600.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/vietnamese-400.css'
import '@fontsource/inter/vietnamese-500.css'
import '@fontsource/inter/vietnamese-600.css'
import './styles/tokens.css'
import './index.css'
import { initDb } from './db/init'
import { syncManager } from './sync/manager'
import { Layout } from './app/Layout'
import { TodayPage } from './features/today/TodayPage'
import { QuickAddPage } from './features/quick-add/QuickAddPage'
import { InboxPage } from './features/inbox/InboxPage'
import { LibraryPage } from './features/library/LibraryPage'
import { ConceptDetailPage } from './features/library/ConceptDetailPage'
import { ImportPage } from './features/import/ImportPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { LearnPage } from './features/learn/LearnPage'
import { SessionPage } from './features/learn/SessionPage'
import { SearchPage } from './features/search/SearchPage'

async function bootstrap() {
  await initDb()
  // Background sync; does nothing until PO sets it up in Settings.
  void syncManager.start()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<TodayPage />} />
            <Route path="quick-add" element={<QuickAddPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="learn" element={<LearnPage />} />
            <Route path="learn/session" element={<SessionPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="library/:conceptId" element={<ConceptDetailPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </StrictMode>,
  )
}

bootstrap()
