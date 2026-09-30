import type { AdvancedKind } from './advancedTags';

export type AdvancedPropGroupDef = { key: string; labelKey: string };

/** PropertySheet groups for an advanced tag (Identification + Configuration). */
export function propertyGroupsForKind(
  _kind: AdvancedKind,
): AdvancedPropGroupDef[] {
  return [
    {
      key: 'identification',
      labelKey: 'scada.advancedTags.sectionIdentification',
    },
    {
      key: 'configuration',
      labelKey: 'scada.advancedTags.sectionConfiguration',
    },
  ];
}

export type AdvancedPropsFocus = 'empty' | 'group' | 'root' | 'tag';

/** PropertySheet groups for the current Advanced Tags selection. */
export function propertyGroupsForSelection(
  focus: AdvancedPropsFocus,
  kind?: AdvancedKind,
): AdvancedPropGroupDef[] {
  if (focus === 'empty' || focus === 'root') {
    return [];
  }
  if (focus === 'group') {
    return [{ key: 'group', labelKey: 'scada.advancedTags.groupProps' }];
  }
  if (!kind) {
    return propertyGroupsForKind('link');
  }
  return propertyGroupsForKind(kind);
}
