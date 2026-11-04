import { ModuleRegistry } from '../core/registry';
import { LocalSearchService } from './localSearchService';
import type { SearchService } from './types';

export * from './types';

// SearchService modules register here instead of being imported directly
// by screens (spec section 7). The local engine is the default.
export const searchServices = new ModuleRegistry<SearchService>();
export const DEFAULT_SEARCH_SERVICE_ID = 'local';

searchServices.register(new LocalSearchService());

export function getSearchService(id: string = DEFAULT_SEARCH_SERVICE_ID): SearchService {
  const service = searchServices.get(id);
  if (!service) throw new Error(`Search service "${id}" is not registered`);
  return service;
}
