import { scadaClient } from './client';

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
}

export interface AdvancedTagDef {
  id: string;
  name: string;
  kind: AdvancedKind;
  enabled: boolean;
  input?: string;
  output?: string;
  dead_value?: string;
  link_mode?: string;
  update_rate_ms?: number;
  trigger_type?: string;
  source?: string;
  run_tag?: string;
  elements?: AdvancedElement[];
  insert_trigger?: AdvancedTrigger;
  send_trigger?: AdvancedTrigger;
  expression?: string;
  trigger?: AdvancedTrigger;
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
