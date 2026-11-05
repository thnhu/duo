import { listExamplesForConcept } from '../../db/queries';
import { conceptRepository, exampleRepository } from '../../db/repositories';
import { deleteLinksOfConcept, deleteLinksOfExample } from '../../depth';
import { deleteLinksOfConceptNode } from '../../links';

// Soft-deleting a concept also soft-deletes its linked examples, otherwise
// the library/inbox would keep showing examples pointing at a deleted concept.
export async function deleteConceptCascade(conceptId: string): Promise<void> {
  const examples = await listExamplesForConcept(conceptId);
  await Promise.all(examples.map((example) => exampleRepository.softDelete(example.id)));
  await deleteLinksOfConcept(conceptId);
  await deleteLinksOfConceptNode(conceptId);
  await Promise.all(examples.map((example) => deleteLinksOfExample(example.id)));
  await conceptRepository.softDelete(conceptId);
}

export async function deleteExample(exampleId: string): Promise<void> {
  await deleteLinksOfExample(exampleId);
  await exampleRepository.softDelete(exampleId);
}
