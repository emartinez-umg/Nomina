import { businessRules } from '../../../shared/business-rules.js';
export const draftPrefix = (scope = 'local') => `nomina.draft.v1:${encodeURIComponent(scope)}:`;
export function readDrafts(storage, scope = 'local', now = Date.now()) {
  const drafts = new Map();
  const prefix = draftPrefix(scope);
  const expiry = businessRules.draftRetentionDays * 86400000;
  for (const key of Object.keys(storage)) {
    if (!key.startsWith(prefix)) continue;
    try {
      const value = JSON.parse(storage.getItem(key));
      if (
        !value ||
        typeof value !== 'object' ||
        !Number.isFinite(value.savedAt) ||
        now - value.savedAt > expiry ||
        value.savedAt > now + 60000
      ) {
        storage.removeItem(key);
        continue;
      }
      drafts.set(decodeURIComponent(key.slice(prefix.length)), value);
    } catch {
      storage.removeItem(key);
    }
  }
  return drafts;
}
export function writeDraft(storage, scope, key, value) {
  const name = draftPrefix(scope) + encodeURIComponent(key);
  if (value === null) storage.removeItem(name);
  else storage.setItem(name, JSON.stringify(value));
}
