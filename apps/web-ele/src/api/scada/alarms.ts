import { scadaClient } from './client';

export type AlarmSubType = 'deviation' | 'roc' | 'value';

export interface AlarmSubCondition {
  name: string;
  type: AlarmSubType;
  op: string;
  threshold?: number;
  setpoint?: number;
  setpoint_tag?: string;
  deadband?: number;
  rate?: number;
  window_ms?: number;
  severity: number;
  message: string;
  ack_required?: boolean;
}

export interface AlarmCondition {
  name: string;
  enabled: boolean;
  subconditions: AlarmSubCondition[];
}

export interface AlarmSource {
  name: string;
  tag: string;
  conditions: AlarmCondition[];
}

export interface AlarmArea {
  name: string;
  sources: AlarmSource[];
}

export interface AlarmsConfig {
  areas: AlarmArea[];
}

export interface AlarmStateRow {
  source: string;
  condition: string;
  subcondition?: string;
  active: boolean;
  acked: boolean;
  ack_required?: boolean;
  severity: number;
  message?: string;
  tag?: string;
  channel?: string;
  device?: string;
  cookie: number;
  active_time?: string;
  time?: string;
}

export interface AlarmEvent {
  source: string;
  tag?: string;
  channel?: string;
  device?: string;
  condition: string;
  subcondition?: string;
  message?: string;
  severity: number;
  active: boolean;
  acked: boolean;
  change_mask?: number;
  cookie: number;
  time?: string;
}

export async function getAlarms() {
  return scadaClient.get<AlarmsConfig>('/api/v1/alarms');
}

export async function putAlarms(body: AlarmsConfig) {
  return scadaClient.put<AlarmsConfig>('/api/v1/alarms', body);
}

export async function getAlarmState() {
  return scadaClient.get<{ states: AlarmStateRow[] }>('/api/v1/alarms/state');
}

export async function getAlarmEvents() {
  return scadaClient.get<{ events: AlarmEvent[] }>('/api/v1/alarms/events');
}

export async function ackAlarm(body: {
  ack_id?: string;
  condition: string;
  cookie?: number;
  source: string;
}) {
  return scadaClient.post<{ ok: boolean }>('/api/v1/alarms/ack', body);
}

export async function refreshAlarms() {
  return scadaClient.post<{ ok: boolean }>('/api/v1/alarms/refresh', {});
}
