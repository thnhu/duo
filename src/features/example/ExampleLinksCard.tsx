import { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { SETTINGS_ID } from '../../db/defaults';
import { conceptRepository, settingsRepository } from '../../db/repositories';
import type { Concept, Example, ExampleLink, ExampleLinkType } from '../../db/types';
import { linkExample, listLinksOfExample, unlinkExample } from '../../depth';
import styles from './ExampleEditPage.module.css';

const TYPE_LABEL: Record<ExampleLinkType, string> = {
  idiom: 'Idiom',
  nominal: 'Nominal',
  agent: 'Agent',
  patient: 'Patient',
  action: 'Action',
  describedBy: 'Described by',
  describing: 'Describing',
  otherPhrase: 'Other phrase',
};

// "Also a way of saying another concept" (spec 1.4, kind 2). The example's
// own concept (`targetConceptId`) is NOT listed here; this is the extra link.
export function ExampleLinksCard({ example }: { example: Example }) {
  const [links, setLinks] = useState<ExampleLink[]>([]);
  const [depthConcepts, setDepthConcepts] = useState<Concept[]>([]);
  const [types, setTypes] = useState<ExampleLinkType[]>(['otherPhrase']);
  const [conceptId, setConceptId] = useState('');
  const [type, setType] = useState<ExampleLinkType>('otherPhrase');

  async function load() {
    const [current, concepts, settings] = await Promise.all([
      listLinksOfExample(example.id),
      conceptRepository.listActive(),
      settingsRepository.getById(SETTINGS_ID),
    ]);
    setLinks(current);
    setDepthConcepts(
      concepts.filter((c) => c.mode === 'depth' && c.dictionaryId === example.dictionaryId && c.id !== example.targetConceptId),
    );
    setTypes(settings?.linkTypes.exampleConcept ?? ['otherPhrase']);
  }

  useEffect(() => {
    void load();
  }, [example.id]);

  async function handleAdd() {
    if (!conceptId) return;
    await linkExample(example.id, conceptId, type);
    setConceptId('');
    await load();
  }

  async function handleRemove(link: ExampleLink) {
    await unlinkExample(link.id);
    await load();
  }

  const nameOf = (id: string) => depthConcepts.find((c) => c.id === id)?.text ?? '(concept đã xóa hoặc không phải Sâu)';
  const available = depthConcepts.filter((c) => !links.some((l) => l.conceptId === c.id));

  if (links.length === 0 && depthConcepts.length === 0) return null;

  return (
    <Card className={styles.section}>
      <h2>Cũng là cách diễn đạt của concept khác</h2>
      {links.map((link) => (
        <div key={link.id} className={styles.actions}>
          <span>
            {nameOf(link.conceptId)} · {TYPE_LABEL[link.type]}
          </span>
          <Button variant="ghost" onClick={() => void handleRemove(link)}>
            Bỏ liên kết
          </Button>
        </div>
      ))}
      {available.length > 0 && (
        <>
          <div>
            <label className={fieldStyles.label} htmlFor="link-concept">
              Concept Sâu
            </label>
            <select
              id="link-concept"
              className={fieldStyles.input}
              value={conceptId}
              onChange={(e) => setConceptId(e.target.value)}
            >
              <option value="">Chọn concept…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.text}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldStyles.label} htmlFor="link-type">
              Loại liên kết
            </label>
            <select
              id="link-type"
              className={fieldStyles.input}
              value={type}
              onChange={(e) => setType(e.target.value as ExampleLinkType)}
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <Button variant="secondary" disabled={!conceptId} onClick={() => void handleAdd()}>
            Thêm liên kết
          </Button>
        </>
      )}
      <p className={fieldStyles.hint}>
        Concept chủ của cách diễn đạt này không đổi; liên kết chỉ thêm quan hệ sang concept khác.
      </p>
    </Card>
  );
}
