// Pronunciation with the device's own voices (spec C5, Web Speech API).
// Quality depends on the device; when there is no German voice the dictation
// drill says so instead of failing silently (journey J4, exceptions).

function synth(): SpeechSynthesis | undefined {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : undefined;
}

export function isSpeechSupported(): boolean {
  return synth() !== undefined;
}

// Voices load asynchronously in most browsers.
export async function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return [];
  const now = s.getVoices();
  if (now.length > 0) return now;
  return new Promise((resolve) => {
    const finish = () => {
      s.removeEventListener('voiceschanged', finish);
      clearTimeout(timer);
      resolve(s.getVoices());
    };
    const timer = setTimeout(finish, timeoutMs);
    s.addEventListener('voiceschanged', finish);
  });
}

const primaryOf = (tag: string) => tag.slice(0, 2).toLowerCase();
const voiceKey = (tag: string) => `duo:voice:${primaryOf(tag)}`;

export function getPreferredVoiceUri(languageTag: string): string | null {
  try {
    return localStorage.getItem(voiceKey(languageTag));
  } catch {
    return null;
  }
}

// null = automatic (best-ranked voice).
export function setPreferredVoiceUri(languageTag: string, uri: string | null): void {
  try {
    if (uri) localStorage.setItem(voiceKey(languageTag), uri);
    else localStorage.removeItem(voiceKey(languageTag));
  } catch {
    /* storage unavailable: fall back to automatic */
  }
}

// Heuristic quality score: neural/online voices sound far clearer than the
// compact or eSpeak-style defaults some devices list first.
export function voiceScore(v: SpeechSynthesisVoice, languageTag: string): number {
  const name = `${v.name} ${v.voiceURI}`.toLowerCase();
  let score = 0;
  if (v.lang.replace('_', '-').toLowerCase() === languageTag.toLowerCase()) score += 5;
  if (/natural|neural|online/.test(name)) score += 40;
  if (/premium|enhanced|wavenet|studio/.test(name)) score += 30;
  if (/google/.test(name)) score += 20;
  if (!v.localService) score += 10;
  if (/espeak|compact|festival|mbrola/.test(name)) score -= 50;
  return score;
}

export function rankVoices(voices: SpeechSynthesisVoice[], languageTag: string): SpeechSynthesisVoice[] {
  const primary = primaryOf(languageTag);
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith(primary))
    .map((v, i) => ({ v, i, s: voiceScore(v, languageTag) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.v);
}

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  languageTag: string,
): SpeechSynthesisVoice | undefined {
  const preferred = getPreferredVoiceUri(languageTag);
  if (preferred) {
    const chosen = voices.find((v) => v.voiceURI === preferred);
    if (chosen) return chosen;
  }
  return rankVoices(voices, languageTag)[0];
}

export async function hasVoiceFor(languageTag: string): Promise<boolean> {
  return pickVoice(await loadVoices(), languageTag) !== undefined;
}

export async function speak(text: string, languageTag: string, rate = 1): Promise<void> {
  const s = synth();
  if (!s) return;
  const voice = pickVoice(await loadVoices(), languageTag);
  s.cancel();
  await new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = languageTag;
    if (voice) utterance.voice = voice;
    utterance.rate = rate;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    s.speak(utterance);
  });
}

export function stopSpeaking(): void {
  synth()?.cancel();
}
