// Generic module registry (spec section 7): modules register themselves by
// id instead of being hard-imported by the code that uses them.

export interface RegistrableModule {
  id: string;
}

export class ModuleRegistry<T extends RegistrableModule> {
  private readonly modules = new Map<string, T>();

  register(module: T): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Module "${module.id}" is already registered`);
    }
    this.modules.set(module.id, module);
  }

  get(id: string): T | undefined {
    return this.modules.get(id);
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }

  list(): T[] {
    return Array.from(this.modules.values());
  }

  unregister(id: string): void {
    this.modules.delete(id);
  }
}
