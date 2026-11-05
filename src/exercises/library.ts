import { db } from '../db/schema';
import { conceptRepository, exampleRepository } from '../db/repositories';
import type { ExerciseLibrary } from './types';

// Everything a drill may draw on besides the word being asked: the other
// concepts (wrong meaning choices), and, for depth drills, the examples and
// ExampleLinks that make up a concept's ways of saying it.
export async function loadLibrary(): Promise<ExerciseLibrary> {
  const [concepts, examples, links] = await Promise.all([
    conceptRepository.listActive(),
    exampleRepository.listActive(),
    db.exampleLinks.toArray(),
  ]);
  return { concepts, examples, exampleLinks: links.filter((l) => l.deletedAt === undefined) };
}
