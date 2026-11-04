import { describe, expect, it } from 'vitest';
import { ModuleRegistry } from './registry';

interface DummyModule {
  id: string;
  languages: string[];
}

describe('ModuleRegistry', () => {
  it('registers and retrieves a module by id', () => {
    const registry = new ModuleRegistry<DummyModule>();
    registry.register({ id: 'de.dictation', languages: ['de'] });

    expect(registry.get('de.dictation')?.languages).toEqual(['de']);
    expect(registry.has('de.dictation')).toBe(true);
    expect(registry.has('missing')).toBe(false);
  });

  it('throws on duplicate registration', () => {
    const registry = new ModuleRegistry<DummyModule>();
    registry.register({ id: 'de.dictation', languages: ['de'] });

    expect(() => registry.register({ id: 'de.dictation', languages: ['de'] })).toThrow();
  });

  it('lists all registered modules and supports unregister', () => {
    const registry = new ModuleRegistry<DummyModule>();
    registry.register({ id: 'a', languages: ['en'] });
    registry.register({ id: 'b', languages: ['de'] });

    expect(registry.list().map((m) => m.id).sort()).toEqual(['a', 'b']);

    registry.unregister('a');
    expect(registry.list().map((m) => m.id)).toEqual(['b']);
  });
});
