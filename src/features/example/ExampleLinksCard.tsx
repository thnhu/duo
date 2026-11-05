import { useEffect, useState } from "react";
import { Button } from "../../ui/Button";
import { ButtonRow } from "../../ui/ButtonRow";
import { Card } from "../../ui/Card";
import fieldStyles from "../../ui/field.module.css";
import { SETTINGS_ID } from "../../db/defaults";
import { conceptRepository, settingsRepository } from "../../db/repositories";
import type {
  Concept,
  Example,
  ExampleLink,
  ExampleLinkType,
  Lang,
} from "../../db/types";
import {
  linkExample,
  listLinksOfExample,
  setMainConcept,
  unlinkExample,
} from "../../depth";
import { EXAMPLE_LINK_LABEL as TYPE_LABEL } from "../../links/labels";
import { saveQuickWord } from "../quick-add/actions";
import { ConceptPicker } from "../links/ConceptPicker";
import styles from "./ExampleEditPage.module.css";

interface ExampleLinksCardProps {
  example: Example;
  // Language of the example's dictionary (needed to create a concept in place).
  lang: Lang;
  // Called after the main concept changed, so the page can reload.
  onMainChanged: () => void;
}

// ONE list of links (spec R5, PO decision 2026-11-05). In the data the first
// link is the example's home concept (`targetConceptId`, no type) and the rest
// are `ExampleLink`s; the PO only sees "Links", with a small "main" mark.
export function ExampleLinksCard({
  example,
  lang,
  onMainChanged,
}: ExampleLinksCardProps) {
  const [links, setLinks] = useState<ExampleLink[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [types, setTypes] = useState<ExampleLinkType[]>(["otherPhrase"]);
  const [picked, setPicked] = useState<Concept | null>(null);
  const [type, setType] = useState<ExampleLinkType>("otherPhrase");

  async function load() {
    const [current, all, settings] = await Promise.all([
      listLinksOfExample(example.id),
      conceptRepository.listActive(),
      settingsRepository.getById(SETTINGS_ID),
    ]);
    setLinks(current);
    setConcepts(all.filter((c) => c.dictionaryId === example.dictionaryId));
    setTypes(settings?.linkTypes.exampleConcept ?? ["otherPhrase"]);
  }

  useEffect(() => {
    void load();
  }, [example.id, example.targetConceptId]);

  const nameOf = (id: string) =>
    concepts.find((c) => c.id === id)?.text ?? "(concept đã xóa)";
  const main = concepts.find((c) => c.id === example.targetConceptId);
  const linkedIds = new Set([
    example.targetConceptId,
    ...links.map((l) => l.conceptId),
  ]);

  async function handleAdd() {
    if (!picked) return;
    if (!main) {
      // An example without a concept (from the inbox): the first concept
      // linked becomes its main one, which also takes it out of the inbox.
      await setMainConcept(example.id, picked.id);
      setPicked(null);
      onMainChanged();
      return;
    }
    await linkExample(example.id, picked.id, type);
    setPicked(null);
    await load();
  }

  async function handleAddNew(text: string) {
    const { concept } = await saveQuickWord(example.dictionaryId, lang, text);
    await load();
    setPicked(concept);
  }

  async function handleRemove(link: ExampleLink) {
    await unlinkExample(link.id);
    await load();
  }

  async function handleMakeMain(link: ExampleLink) {
    await setMainConcept(example.id, link.conceptId);
    onMainChanged();
  }

  return (
    <Card className={styles.section}>
      <h2>Liên kết ({links.length + (main ? 1 : 0)})</h2>
      {main && (
        <div className={styles.linkRow}>
          <span>
            <strong>{main.text}</strong>{" "}
            <span className={styles.mainTag}>chính</span>
          </span>
        </div>
      )}
      {links.map((link) => (
        <div key={link.id} className={styles.linkRow}>
          <span>
            <strong>{nameOf(link.conceptId)}</strong>{" "}
            <span className={styles.typeTag}>{TYPE_LABEL[link.type]}</span>
          </span>
          <ButtonRow>
            {!example.isMinimal && (
              <Button variant="ghost" onClick={() => void handleMakeMain(link)}>
                Đặt làm chính
              </Button>
            )}
            <Button variant="ghost" onClick={() => void handleRemove(link)}>
              Bỏ
            </Button>
          </ButtonRow>
        </div>
      ))}

      <ConceptPicker
        id="link-concept"
        label="Nối thêm concept"
        concepts={concepts.filter((c) => !linkedIds.has(c.id))}
        selected={picked}
        onSelect={setPicked}
        onAdd={handleAddNew}
      />
      {main && (
        <div>
          <label className={fieldStyles.label} htmlFor="link-type">
            Relation
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
      )}
      <ButtonRow>
        <Button
          variant="secondary"
          disabled={!picked}
          onClick={() => void handleAdd()}
        >
          {main ? "Thêm liên kết" : "Gắn concept"}
        </Button>
      </ButtonRow>
      {!main && (
        <p className={fieldStyles.hint}>
          Ví dụ này chưa có concept. Concept đầu tiên bạn gắn sẽ là concept
          chính.
        </p>
      )}
      <p className={fieldStyles.hint}>
        Concept “chính” là nơi ví dụ này được học và ôn; các liên kết khác chỉ
        giúp tìm lại ví dụ từ concept khác.
      </p>
    </Card>
  );
}
