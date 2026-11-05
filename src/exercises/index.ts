import { ModuleRegistry } from '../core/registry';
import type { Lang } from '../db/types';
import { germanModules } from './de/modules';
import { englishDeepModules } from './en/deep';
import { englishModules } from './en/modules';
import { passageModules } from './passage';
import type { ExerciseModule } from './types';

export * from './types';

// Exercise types register here instead of being imported by screens
// (spec section 7). Adding English drills later means registering more
// modules; nothing else changes.
export const exerciseModules = new ModuleRegistry<ExerciseModule>();
for (const module of germanModules) exerciseModules.register(module);
for (const module of englishModules) exerciseModules.register(module);
for (const module of englishDeepModules) exerciseModules.register(module);
for (const module of passageModules) exerciseModules.register(module);

export function modulesForLanguage(lang: Lang): ExerciseModule[] {
  return exerciseModules.list().filter((m) => m.languages.includes(lang));
}
