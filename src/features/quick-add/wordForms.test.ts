import { describe, expect, it } from 'vitest';
import { emptyGrammarValues, grammarFieldsFor, grammarFromValues, valuesFromGrammar } from './wordForms';

describe('word form boxes', () => {
  it('shows grammar boxes for German nouns and verbs only', () => {
    expect(grammarFieldsFor('de', 'noun').map((f) => f.key)).toEqual(['gender', 'plural']);
    expect(grammarFieldsFor('de', 'verb').map((f) => f.key)).toEqual([
      'infinitiv',
      'praesens3sg',
      'praeteritum',
      'partizip2',
    ]);
    expect(grammarFieldsFor('de', 'adjective')).toEqual([]);
    expect(grammarFieldsFor('de', '')).toEqual([]);
    // English keeps the plain form.
    expect(grammarFieldsFor('en', 'noun')).toEqual([]);
    expect(grammarFieldsFor('en', 'verb')).toEqual([]);
  });

  it('stores a noun as gender + full plural', () => {
    const values = { ...emptyGrammarValues(), gender: 'die', plural: ' Adressen ' };
    expect(grammarFromValues(values, grammarFieldsFor('de', 'noun'), 'Adresse')).toEqual({
      gender: 'die',
      plural: 'Adressen',
    });
  });

  it('stores a verb with its forms and the word as Infinitiv when left empty', () => {
    const values = { ...emptyGrammarValues(), praeteritum: 'fuhr ab', partizip2: 'ist abgefahren' };
    expect(grammarFromValues(values, grammarFieldsFor('de', 'verb'), 'abfahren')).toEqual({
      verbForms: { infinitiv: 'abfahren', praeteritum: 'fuhr ab', partizip2: 'ist abgefahren' },
    });
  });

  it('ignores boxes that are not shown, and stores nothing when nothing is filled', () => {
    // A leftover plural typed before switching the part of speech to verb.
    const values = { ...emptyGrammarValues(), plural: 'Adressen' };
    expect(grammarFromValues(values, grammarFieldsFor('de', 'adjective'), 'groß')).toBeUndefined();
    expect(grammarFromValues(emptyGrammarValues(), grammarFieldsFor('de', 'noun'), 'Adresse')).toBeUndefined();
  });

  it('turns stored grammar back into box values', () => {
    expect(valuesFromGrammar({ gender: 'das', plural: 'Häuser' })).toEqual({
      ...emptyGrammarValues(),
      gender: 'das',
      plural: 'Häuser',
    });
  });
});
