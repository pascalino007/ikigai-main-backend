/**
 * Minimal in-memory stand-in for a TypeORM EntityManager/DataSource, used to
 * unit-test services that run logic inside `dataSource.transaction(manager => ...)`
 * without needing a real database. Supports exactly the subset of the API
 * these services use: create/save/findOne/find with flat equality `where`
 * clauses. Locks and relation-loading hints are accepted and ignored — the
 * object graph is already linked in memory before `save`, so relations like
 * `transaction.booking` just work.
 */

type Where = Record<string, unknown>;
type EntityClass<T> = new (...args: never[]) => T;

function matches(record: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => record[key] === value);
}

export class FakeManager {
  private readonly stores = new Map<EntityClass<unknown>, Map<number, Record<string, unknown>>>();
  private readonly nextIds = new Map<EntityClass<unknown>, number>();

  private storeFor<T>(Entity: EntityClass<T>): Map<number, Record<string, unknown>> {
    if (!this.stores.has(Entity as EntityClass<unknown>)) {
      this.stores.set(Entity as EntityClass<unknown>, new Map());
      this.nextIds.set(Entity as EntityClass<unknown>, 1);
    }
    return this.stores.get(Entity as EntityClass<unknown>)!;
  }

  create<T>(_Entity: EntityClass<T>, data: Partial<T>): T {
    return { ...(data as object) } as T;
  }

  async save<T extends { id?: number | null }>(Entity: EntityClass<T>, entity: T): Promise<T> {
    const store = this.storeFor(Entity);
    if (entity.id == null) {
      const id = this.nextIds.get(Entity as EntityClass<unknown>)!;
      this.nextIds.set(Entity as EntityClass<unknown>, id + 1);
      entity.id = id;
    }
    store.set(entity.id as number, entity as unknown as Record<string, unknown>);
    return entity;
  }

  async findOne<T>(Entity: EntityClass<T>, options: { where: Where }): Promise<T | null> {
    const store = this.storeFor(Entity);
    for (const record of store.values()) {
      if (matches(record, options.where)) return record as unknown as T;
    }
    return null;
  }

  async find<T>(Entity: EntityClass<T>, options: { where: Where }): Promise<T[]> {
    const store = this.storeFor(Entity);
    return [...store.values()]
      .filter((record) => matches(record, options.where))
      .map((record) => record as unknown as T);
  }

  /** `manager.update(Entity, id, partial)` — merges `partial` into the stored record by id. */
  async update<T>(Entity: EntityClass<T>, id: number, partial: Partial<T>): Promise<void> {
    const store = this.storeFor(Entity);
    const record = store.get(id);
    if (record) Object.assign(record, partial);
  }

  /** Test-only convenience: insert a record directly, bypassing create(). */
  async seed<T extends { id?: number | null }>(Entity: EntityClass<T>, entity: T): Promise<T> {
    return this.save(Entity, entity);
  }
}

/** Wraps a FakeManager as a fake DataSource: `.transaction(cb)` just invokes cb(manager). */
export function makeFakeDataSource(manager: FakeManager) {
  return {
    transaction: jest.fn(async (cb: (m: FakeManager) => unknown) => cb(manager)),
    getRepository: jest.fn((Entity: EntityClass<unknown>) => {
      const typedEntity = Entity as EntityClass<{ id?: number | null }>;
      return {
        save: (entity: Record<string, unknown>) => manager.save(typedEntity, entity as { id?: number | null }),
        findOne: (options: { where: Where }) => manager.findOne(Entity, options),
      };
    }),
  };
}
