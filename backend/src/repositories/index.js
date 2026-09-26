import { createRepository } from './repository.js';
// Each editable table receives an isolated DAO using only its validated schema.
export function createRepositories(catalog) {
  return new Map(
    [...catalog.values()]
      .filter((t) => !t.external)
      .map((t) => [t.slug, createRepository(t, catalog)]),
  );
}
