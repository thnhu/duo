import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
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
import { AddChoicePage } from './features/quick-add/AddChoicePage'
import { InboxPage } from './features/inbox/InboxPage'
import { LibraryPage } from './features/library/LibraryPage'
import { ConceptDetailPage } from './features/library/ConceptDetailPage'
import { NewDepthConceptPage } from './features/library/NewDepthConceptPage'
import { AssociationPage } from './features/association/AssociationPage';
import { SetsPage } from './features/sets/SetsPage';
import { LinkEditorPage } from './features/links/LinkEditorPage';
import { TreePage } from './features/tree/TreePage'
import { ExampleEditPage } from './features/example/ExampleEditPage'
import { ImportPage } from './features/import/ImportPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { LearnPage } from './features/learn/LearnPage'
import { SessionPage } from './features/learn/SessionPage'
import { SearchPage } from './features/search/SearchPage'
import { ToastProvider } from './ui/Toast'

async function bootstrap() {
  // The AI suggestion feature was removed; drop the API key it left on this device.
  try {
    for (const key of ['duo.ai.apiKey', 'duo.ai.usage']) localStorage.removeItem(key)
  } catch {
    // storage unavailable: nothing to clean
  }
  await initDb()
  // Background sync; does nothing until PO sets it up in Settings.
  void syncManager.start()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<TodayPage />} />
            <Route path="add" element={<AddChoicePage />} />
            <Route path="add/word" element={<QuickAddPage kind="word" />} />
            <Route path="add/concept" element={<QuickAddPage kind="concept" />} />
            <Route path="add/example" element={<QuickAddPage kind="example" />} />
            <Route path="quick-add" element={<Navigate to="/add" replace />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="learn" element={<LearnPage />} />
            <Route path="learn/session" element={<SessionPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="library/:conceptId" element={<ConceptDetailPage />} />
            <Route path="depth/new" element={<NewDepthConceptPage />} />
            <Route path="association" element={<AssociationPage />} />
            <Route path="association/:conceptId" element={<AssociationPage />} />
            <Route path="sets" element={<SetsPage />} />
            <Route path="links" element={<LinkEditorPage />} />
            <Route path="links/:conceptId" element={<LinkEditorPage />} />
            <Route path="tree" element={<TreePage />} />
            <Route path="tree/:conceptId" element={<TreePage />} />
            <Route path="example/:exampleId" element={<ExampleEditPage />} />
          </Route>
        </Routes>
        </ToastProvider>
      </HashRouter>
    </StrictMode>,
  )
}

bootstrap()
