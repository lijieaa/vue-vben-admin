import { describe, expect, it } from 'vitest';

import {
  propertyGroupsForKind,
  propertyGroupsForSelection,
} from '../advancedTagProps';

describe('propertyGroupsForKind', () => {
  it('always includes identification and configuration', () => {
    for (const kind of [
      'average',
      'minimum',
      'maximum',
      'link',
      'complex',
      'derived',
      'cumulative',
    ] as const) {
      expect(propertyGroupsForKind(kind).map((g) => g.key)).toEqual([
        'identification',
        'configuration',
      ]);
    }
  });
});

describe('propertyGroupsForSelection', () => {
  it('returns empty groups for root/empty focus', () => {
    expect(propertyGroupsForSelection('root')).toEqual([]);
    expect(propertyGroupsForSelection('empty')).toEqual([]);
  });

  it('returns group sheet for group focus', () => {
    expect(propertyGroupsForSelection('group').map((g) => g.key)).toEqual([
      'group',
    ]);
  });

  it('returns kind groups for tag focus', () => {
    expect(
      propertyGroupsForSelection('tag', 'average').map((g) => g.key),
    ).toEqual(['identification', 'configuration']);
  });
});
