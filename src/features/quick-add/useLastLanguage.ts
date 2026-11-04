import { useState } from 'react';
import type { Lang } from '../../db/types';

const STORAGE_KEY = 'duo:last-lang';

function readStored(): Lang {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === 'en' || value === 'de' ? value : 'en';
}

// J2: Ghi nhanh remembers the language from the last time it was used.
export function useLastLanguage(): [Lang, (lang: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(readStored);

  function setLang(next: Lang) {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }

  return [lang, setLang];
}
