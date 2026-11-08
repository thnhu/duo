import { SETTINGS_ID, defaultAcquisitionCriteria } from '../db/defaults';
import { conceptRepository, reviewLogRepository, settingsRepository } from '../db/repositories';
import type { AcquisitionCriteria, AcquisitionStatus } from '../db/types';
import { computeProgress, nextStatus } from './index';

export async function loadCriteria(): Promise<AcquisitionCriteria> {
  const settings = await settingsRepository.getById(SETTINGS_ID);
  return settings?.acquisitionCriteria ?? defaultAcquisitionCriteria;
}

export interface StatusChange {
  before: AcquisitionStatus;
  after: AcquisitionStatus;
}

// Recomputes one concept's status from its ReviewLogs and saves it if it
// changed. Called after every recorded answer.
export async function refreshAcquisition(conceptId: string): Promise<StatusChange | null> {
  const concept = await conceptRepository.getById(conceptId);
  if (!concept || concept.deletedAt !== undefined) return null;
  // Depth concepts are ideas with several ways of saying them; their drills
  // log answers and schedule examples but do not set `acquired` (spec 10, Bản 3).
  if (concept.mode === 'depth' || concept.grammarTopic) return null;
  const [logs, criteria] = await Promise.all([
    reviewLogRepository.listByConceptId(conceptId),
    loadCriteria(),
  ]);
  const result = nextStatus(concept.status, logs, criteria, concept.progressResetAt);
  if (result.status === concept.status) return null;
  await conceptRepository.update(conceptId, {
    status: result.status,
    ...(result.resetAt !== undefined ? { progressResetAt: result.resetAt } : {}),
  });
  return { before: concept.status, after: result.status };
}

export async function saveCriteria(criteria: AcquisitionCriteria): Promise<void> {
  await settingsRepository.update(SETTINGS_ID, { acquisitionCriteria: criteria });
}

export interface RecomputeSummary {
  promoted: number;
  demoted: number;
}

// After the thresholds change, every word that has answers is judged again
// against the new thresholds: it is acquired exactly when its answers (since
// the last slip, if any) meet them. Words without any answer are left alone.
export async function recomputeAcquisition(criteria?: AcquisitionCriteria): Promise<RecomputeSummary> {
  const rules = criteria ?? (await loadCriteria());
  const [concepts, logs] = await Promise.all([
    conceptRepository.listActive(),
    reviewLogRepository.listAll(),
  ]);
  const byConcept = new Map<string, typeof logs>();
  for (const log of logs) {
    const list = byConcept.get(log.conceptId) ?? [];
    list.push(log);
    byConcept.set(log.conceptId, list);
  }

  const summary: RecomputeSummary = { promoted: 0, demoted: 0 };
  for (const concept of concepts) {
    const own = byConcept.get(concept.id);
    if (!own || own.length === 0 || concept.mode === 'depth' || concept.grammarTopic) continue;
    const status = computeProgress(own, rules, concept.progressResetAt).met ? 'acquired' : 'loaded';
    if (status === concept.status) continue;
    await conceptRepository.update(concept.id, { status });
    if (status === 'acquired') summary.promoted++;
    else summary.demoted++;
  }
  return summary;
}
