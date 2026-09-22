import { scadaClient } from './client';

export type EventLogType =
  | 'error'
  | 'information'
  | 'security'
  | 'unknown'
  | 'warning';

export interface EventLogRecord {
  id: number;
  time: string;
  type: EventLogType;
  source: string;
  event: string;
  user?: string;
}

export async function fetchEventLog(params?: {
  limit?: number;
  type?: '' | EventLogType;
}) {
  return scadaClient.get<{ records: EventLogRecord[]; count: number }>(
    '/api/v1/event-log',
    {
      params: {
        limit: params?.limit ?? 500,
        ...(params?.type ? { type: params.type } : {}),
      },
    },
  );
}

export async function clearEventLog() {
  return scadaClient.delete<{ ok: boolean }>('/api/v1/event-log');
}

/** Absolute SSE URL for Event Log live stream (uses Vite proxy when relative). */
export function eventLogStreamURL(): string {
  const base = import.meta.env.VITE_SCADA_API_URL || '/scada-api';
  if (base.startsWith('http')) {
    return `${base.replace(/\/$/, '')}/api/v1/event-log/stream`;
  }
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${base.replace(/\/$/, '')}/api/v1/event-log/stream`;
}
