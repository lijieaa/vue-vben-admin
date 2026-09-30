import { scadaClient } from './client';

export type AdvancedToolbarCaps = {
  canDelete: boolean;
  canDisable: boolean;
  canEnable: boolean;
  canNewGroup: boolean;
  canNewKind: boolean;
  focus: 'group' | 'root' | 'tag';
};

export type AdvancedKind =
  | 'average'
  | 'complex'
  | 'cumulative'
  | 'derived'
  | 'link'
  | 'maximum'
  | 'minimum';

export type TriggerMode = 'by_rate' | 'by_tag';

export interface AdvancedTrigger {
  mode: TriggerMode;
  rate?: number;
  rate_unit?: string;
  trigger_tag?: string;
  complete_tag?: string;
}

export interface AdvancedElement {
  name: string;
  tag: string;
  insert_trigger?: AdvancedTrigger;
}

export interface AdvancedTagDef {
  id: string;
  name: string;
  kind: AdvancedKind;
  enabled: boolean;
  description?: string;
  input?: string;
  output?: string;
  dead_value?: string;
  link_mode?: string;
  update_rate_ms?: number;
  trigger_type?: string;
  trigger_tag?: string;
  comparison?: string;
  trigger_value?: string;
  trigger_scan_rate_ms?: number;
  source?: string;
  run_tag?: string;
  elements?: AdvancedElement[];
  insert_trigger?: AdvancedTrigger;
  send_trigger?: AdvancedTrigger;
  expression?: string;
  trigger?: AdvancedTrigger;
  /** Derived output data type (String/Boolean/…/Double). */
  data_type?: string;
  max_type?: string;
  max_value?: number;
}

export interface AdvancedTagGroup {
  name: string;
  enabled: boolean;
  groups?: AdvancedTagGroup[];
  tags?: AdvancedTagDef[];
}

export interface AdvancedTagsConfig {
  groups: AdvancedTagGroup[];
  /** Tags directly under Advanced Tags root (no group required). */
  tags?: AdvancedTagDef[];
}

export interface AdvancedValidateResult {
  ok: boolean;
  refs?: string[];
  value?: number;
  eval_note?: string;
  error?: string;
}

export async function getAdvancedTags() {
  return scadaClient.get<AdvancedTagsConfig>('/api/v1/advanced-tags');
}

export async function putAdvancedTags(body: AdvancedTagsConfig) {
  return scadaClient.put<AdvancedTagsConfig>('/api/v1/advanced-tags', body);
}

export async function validateAdvancedExpression(expression: string) {
  return scadaClient.post<AdvancedValidateResult>(
    '/api/v1/advanced-tags/validate',
    { expression },
  );
}

export function emptyTrigger(mode: TriggerMode = 'by_rate'): AdvancedTrigger {
  return {
    mode,
    rate: 1,
    rate_unit: 'seconds',
    trigger_tag: '',
    complete_tag: '',
  };
}

export function newTagDef(kind: AdvancedKind, name: string): AdvancedTagDef {
  const base: AdvancedTagDef = {
    id: `at-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    kind,
    enabled: true,
  };
  switch (kind) {
    case 'link': {
      return {
        ...base,
        link_mode: 'on_data_change',
        dead_value: '0',
        trigger_type: 'always',
        comparison: '==',
        trigger_scan_rate_ms: 500,
        update_rate_ms: 1000,
      };
    }
    case 'average':
    case 'minimum':
    case 'maximum': {
      return { ...base, source: '', run_tag: '' };
    }
    case 'complex': {
      return {
        ...base,
        elements: [],
        send_trigger: emptyTrigger('by_rate'),
      };
    }
    case 'derived': {
      return {
        ...base,
        expression: '',
        data_type: 'Double',
        trigger: emptyTrigger('by_rate'),
      };
    }
    case 'cumulative': {
      return { ...base, source: '', max_type: 'byte' };
    }
    default: {
      return base;
    }
  }
}
