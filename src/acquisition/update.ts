import { SETTINGS_ID, defaultAcquisitionCriteria } from '../db/defaults';
import { conceptRepository, reviewLogRepository, settingsRepository } from '../db/repositories';
import type { AcquisitionCriteria, AcquisitionStatus } from '../db/types';
import { nextStatus } from './index';

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
