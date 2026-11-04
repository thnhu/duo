import { listExamplesForConcept } from '../../db/queries';
import { conceptRepository, exampleRepository } from '../../db/repositories';

// Soft-deleting a concept also soft-deletes its linked examples, otherwise
// the library/inbox would keep showing examples pointing at a deleted concept.
export async function deleteConceptCascade(conceptId: string): Promise<void> {
  const examples = await listExamplesForConcept(conceptId);
  await Promise.all(examples.map((example) => exampleRepository.softDelete(example.id)));
  await conceptRepository.softDelete(conceptId);
}

export async function deleteExample(exampleId: string): Promise<void> {
  await exampleRepository.softDelete(exampleId);
}
