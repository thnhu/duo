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

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  languageTag: string,
): SpeechSynthesisVoice | undefined {
  const primary = languageTag.slice(0, 2).toLowerCase();
  const exact = voices.find((v) => v.lang.replace('_', '-').toLowerCase() === languageTag.toLowerCase());
  return exact ?? voices.find((v) => v.lang.toLowerCase().startsWith(primary));
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
