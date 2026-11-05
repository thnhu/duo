import { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import {
  getPreferredVoiceUri,
  isSpeechSupported,
  loadVoices,
  pickVoice,
  rankVoices,
  setPreferredVoiceUri,
  speak,
} from '../../exercises/speech';
import styles from './SettingsPage.module.css';

const TAGS = [
  { tag: 'de-DE', label: 'Tiếng Đức (de-DE)', sample: 'Guten Morgen, ich möchte einen Apfel essen.' },
  { tag: 'en-US', label: 'Tiếng Anh (en-US)', sample: 'Good morning, I would like to eat an apple.' },
];

function VoiceRow({ tag, label, sample }: { tag: string; label: string; sample: string }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selected, setSelected] = useState(getPreferredVoiceUri(tag) ?? '');
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let current = true;
    void loadVoices().then((all) => {
      if (current) setVoices(rankVoices(all, tag));
    });
    return () => {
      current = false;
    };
  }, [tag]);

  function change(uri: string) {
    setSelected(uri);
    setPreferredVoiceUri(tag, uri || null);
  }

  const active = pickVoice(voices, tag);

  return (
    <div>
      <label className={fieldStyles.label} htmlFor={`voice-${tag}`}>
        {label}
      </label>
      {voices.length === 0 ? (
        <p className={styles.note}>Thiết bị này chưa có giọng {tag}. Cài thêm giọng trong cài đặt hệ thống.</p>
      ) : (
        <>
          <select
            id={`voice-${tag}`}
            className={fieldStyles.input}
            value={selected}
            onChange={(e) => change(e.target.value)}
          >
            <option value="">Tự chọn giọng tốt nhất{active ? ` (${active.name})` : ''}</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang}){v.localService ? '' : ' · online'}
              </option>
            ))}
          </select>
          <label className={styles.note}>
            <input type="checkbox" checked={slow} onChange={(e) => setSlow(e.target.checked)} /> Nghe chậm
          </label>
          <Button variant="secondary" onClick={() => void speak(sample, tag, slow ? 0.6 : 1)}>
            Nghe thử
          </Button>
        </>
      )}
    </div>
  );
}

// Settings → Giọng đọc: the browser's own voices differ a lot per device, so
// the PO can pick a clearer one. Stored per device (localStorage).
export function VoiceCard() {
  if (!isSpeechSupported()) return null;
  return (
    <Card className={styles.card}>
      <h2>Giọng đọc</h2>
      {TAGS.map((t) => (
        <VoiceRow key={t.tag} {...t} />
      ))}
      <p className={styles.note}>
        Dùng giọng có sẵn của thiết bị, miễn phí và chạy offline. Giọng ghi "Natural", "Neural", "Google" hay
        "online" thường rõ hơn. Lựa chọn đặt riêng từng thiết bị.
      </p>
    </Card>
  );
}
