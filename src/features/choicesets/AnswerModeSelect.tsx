import fieldStyles from '../../ui/field.module.css';
import type { AnswerMode } from '../../db/types';

interface AnswerModeSelectProps {
  id: string;
  value: AnswerMode;
  onChange: (mode: AnswerMode) => void;
}

// How a grammar passage is answered: tap the tiles of its set, or type.
export function AnswerModeSelect({ id, value, onChange }: AnswerModeSelectProps) {
  return (
    <div>
      <label className={fieldStyles.label} htmlFor={id}>
        Cách trả lời
      </label>
      <select id={id} className={fieldStyles.input} value={value} onChange={(e) => onChange(e.target.value as AnswerMode)}>
        <option value="tiles">Bấm thẻ</option>
        <option value="type">Gõ đáp án</option>
      </select>
    </div>
  );
}
