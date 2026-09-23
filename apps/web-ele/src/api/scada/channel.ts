import { scadaClient } from './client';

export interface ScadaMedium {
  kind: string;
  host?: string;
  port?: number;
}

export interface ScadaChannelInfo {
  name: string;
  driver: string;
  started: boolean;
  device_count: number;
  diagnostics_enabled?: boolean;
  description?: string;
  medium?: ScadaMedium;
  settings?: Record<string, unknown>;
}

export interface ScadaChannelCreateBody {
  id?: string;
  name: string;
  description?: string;
  driver: string;
  medium: ScadaMedium;
  settings?: Record<string, unknown>;
  devices?: unknown[];
}

export interface ScadaDevice {
  id?: string;
  name: string;
  description?: string;
  model?: string;
  sub_model?: string;
  station_id?: number;
  scan_rate_ms?: number;
  timeout_ms?: number;
  retries?: number;
  settings?: Record<string, unknown>;
  tags?: unknown[];
  groups?: unknown[];
}

export interface ScadaDeviceCreateBody {
  id?: string;
  name: string;
  description?: string;
  model?: string;
  sub_model?: string;
  station_id?: number;
  scan_rate_ms?: number;
  timeout_ms?: number;
  retries?: number;
  settings?: Record<string, unknown>;
  tags?: unknown[];
}

export interface ScadaDeviceInfo {
  id?: string;
  name: string;
  description?: string;
  model?: string;
  sub_model?: string;
  station_id?: number;
  enabled?: boolean;
  simulated?: boolean;
  scan_mode?: string;
  started?: boolean;
  demoted?: boolean;
  status?: string;
  error?: string;
  scan_rate_ms?: number;
  timeout_ms?: number;
  retries?: number;
  tag_count?: number;
  settings?: Record<string, unknown>;
}

export interface ScadaDriverInfo {
  name: string;
  friendly_name?: string;
  schema_name?: string;
  mediums?: string[];
}

export interface ScadaModelInfo {
  id: string;
  name: string;
  max_devices?: number;
}

export interface ScadaNetworkAdapter {
  value: string;
  ip: string;
  name: string;
}

export interface SchemaOption {
  value: boolean | number | string;
  label: string;
}

export interface SchemaField {
  type?: string;
  default?: unknown;
  min?: number;
  max?: number;
  options?: SchemaOption[];
  options_source?: string;
  options_from_range?: {
    zero_label?: string;
    label_prefix?: string;
    start?: number;
    end?: number;
  };
}

export interface ChannelSettingsSchema {
  fields?: Record<string, SchemaField>;
  project_fields?: Record<string, SchemaField>;
}

function channelPath(name: string) {
  return `/api/v1/channels/${encodeURIComponent(name)}`;
}

function devicePath(channel: string, device: string) {
  return `${channelPath(channel)}/devices/${encodeURIComponent(device)}`;
}

export function fetchChannels() {
  return scadaClient.get<ScadaChannelInfo[]>('/api/v1/channels');
}

export function createChannel(body: ScadaChannelCreateBody) {
  return scadaClient.post<{ ok: boolean; name: string }>(
    '/api/v1/channels',
    body,
  );
}

export function fetchChannel(name: string) {
  return scadaClient.get<ScadaChannelInfo>(channelPath(name));
}

export function patchChannel(name: string, patch: Record<string, unknown>) {
  return scadaClient.request<ScadaChannelInfo>(channelPath(name), {
    method: 'PATCH',
    data: patch,
  });
}

export function fetchChannelDevices(channel: string) {
  return scadaClient.get<ScadaDevice[]>(`${channelPath(channel)}/devices`);
}

export interface ScadaDeviceListPage {
  devices: ScadaDevice[];
  total: number;
  page: number;
  page_size: number;
}

export function fetchChannelDevicesPage(
  channel: string,
  query: {
    name?: string;
    model?: string;
    page?: number;
    page_size?: number;
  },
) {
  return scadaClient.get<ScadaDeviceListPage>(
    `${channelPath(channel)}/devices`,
    {
      params: {
        name: query.name || undefined,
        model: query.model || undefined,
        page: query.page ?? 1,
        page_size: query.page_size ?? 50,
      },
    },
  );
}

export function createChannelDevice(
  channel: string,
  body: ScadaDeviceCreateBody,
) {
  return scadaClient.post<{ ok: boolean; channel: string; device: string }>(
    `${channelPath(channel)}/devices`,
    body,
  );
}

export function fetchChannelDevice(channel: string, device: string) {
  return scadaClient.get<ScadaDeviceInfo>(devicePath(channel, device));
}

export function patchChannelDevice(
  channel: string,
  device: string,
  patch: Record<string, unknown>,
) {
  return scadaClient.request<ScadaDeviceInfo>(devicePath(channel, device), {
    method: 'PATCH',
    data: patch,
  });
}

export function reinitChannelDevice(channel: string, device: string) {
  return scadaClient.post<ScadaDeviceInfo | { ok: boolean }>(
    `${devicePath(channel, device)}/reinit`,
  );
}

export function deleteChannelDevice(channel: string, device: string) {
  return scadaClient.delete<{ ok: boolean; channel: string; device: string }>(
    devicePath(channel, device),
  );
}

export function fetchDrivers() {
  return scadaClient.get<ScadaDriverInfo[]>('/api/v1/drivers');
}

export function fetchDriver(name: string) {
  return scadaClient.get<{
    info: ScadaDriverInfo;
    models: ScadaModelInfo[];
  }>(`/api/v1/drivers/${encodeURIComponent(name)}`);
}

export interface ScadaAddressHint {
  text: string;
  example: string;
  data_type?: string;
}

export function fetchDriverAddressHelp(name: string) {
  return scadaClient.get<{
    dialect?: string;
    examples?: string[];
    hints?: ScadaAddressHint[];
    notes?: string;
  }>(`/api/v1/drivers/${encodeURIComponent(name)}/tag-address-help`);
}

export function fetchNetworkAdapters() {
  return scadaClient.get<ScadaNetworkAdapter[]>('/api/v1/network-adapters');
}

export function fetchChannelSettingsSchema() {
  return scadaClient.get<ChannelSettingsSchema>(
    '/api/v1/channel-settings/schema',
  );
}

export function fetchDeviceSettingsSchema() {
  return scadaClient.get<ChannelSettingsSchema>(
    '/api/v1/device-settings/schema',
  );
}

export interface ScadaTag {
  id?: string;
  name: string;
  address: string;
  data_type?: string;
  access?: string;
  description?: string;
  scan_rate_ms?: number;
  respect_client_type?: boolean;
  scaling?: {
    enabled?: boolean;
    type?: string;
    raw_low?: number;
    raw_high?: number;
    eng_low?: number;
    eng_high?: number;
    clamp?: boolean;
    clamp_low?: boolean;
    clamp_high?: boolean;
    negate?: boolean;
    units?: string;
  };
  group?: string;
}

export interface ScadaTagEntry {
  name: string;
  address?: string;
  data_type?: string;
  access?: string;
  description?: string;
  scan_rate_ms?: number;
  respect_client_type?: boolean;
  scaling?: ScadaTag['scaling'];
  group?: string[];
  group_path?: string;
}

export function fetchDeviceTags(channel: string, device: string) {
  return scadaClient.get<{ tags: ScadaTagEntry[] }>(
    `${devicePath(channel, device)}/tags`,
  );
}

export interface ScadaTagListPage {
  tags: ScadaTagEntry[];
  total: number;
  page: number;
  page_size: number;
}

export function fetchDeviceTagsPage(
  channel: string,
  device: string,
  query: {
    name?: string;
    address?: string;
    /** "1" = writable (W/RW), "0" = read-only, omit = all */
    writable?: string;
    /** "1" = scaling.enabled, "0" = off/absent, omit = all */
    scaling?: string;
    page?: number;
    page_size?: number;
  },
) {
  return scadaClient.get<ScadaTagListPage>(
    `${devicePath(channel, device)}/tags`,
    {
      params: {
        name: query.name || undefined,
        address: query.address || undefined,
        writable: query.writable || undefined,
        scaling: query.scaling || undefined,
        page: query.page ?? 1,
        page_size: query.page_size ?? 50,
      },
    },
  );
}

export interface ScadaLiveTag {
  path: string;
  value?: unknown;
  quality?: number | string;
  ts?: string;
}

export function putLiveTag(path: string, value: unknown) {
  const segments = path
    .split('.')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return scadaClient.request<{ ok: boolean; path: string }>(
    `/api/v1/tags/${segments}`,
    { method: 'PUT', data: { value } },
  );
}

export type ScadaWriteResult = {
  path: string;
  ok: boolean;
  error?: string;
};

export function batchWriteTags(items: { path: string; value: unknown }[]) {
  return scadaClient.post<{ results: ScadaWriteResult[] }>(
    '/api/v1/tags/batch-write',
    { items },
  );
}

export function fetchLiveTags() {
  return scadaClient.get<ScadaLiveTag[]>('/api/v1/tags');
}

export function addClientRef(path: string) {
  return scadaClient.post<{ path: string; refs: number; active: boolean }>(
    '/api/v1/tags/client-ref',
    { path, op: 'add' },
  );
}

export function removeClientRef(path: string) {
  return scadaClient.post<{ path: string; refs: number; active: boolean }>(
    '/api/v1/tags/client-ref',
    { path, op: 'remove' },
  );
}

export function createDeviceTag(
  channel: string,
  device: string,
  body: ScadaTag,
) {
  return scadaClient.post<{ ok: boolean; name: string; group?: string }>(
    `${devicePath(channel, device)}/tags`,
    body,
  );
}

export function patchDeviceTag(
  channel: string,
  device: string,
  tag: string,
  patch: Record<string, unknown>,
) {
  return scadaClient.request<ScadaTag & { ok?: boolean }>(
    `${devicePath(channel, device)}/tags/${encodeURIComponent(tag)}`,
    { method: 'PATCH', data: patch },
  );
}

export function deleteDeviceTag(channel: string, device: string, tag: string) {
  return scadaClient.delete<{ ok: boolean }>(
    `${devicePath(channel, device)}/tags/${encodeURIComponent(tag)}`,
  );
}

export function fetchDriverChannelSettingsSchema(driver: string) {
  return scadaClient.get<{
    driver: string;
    schema_name?: string;
    fields?: Record<string, SchemaField>;
  }>(`/api/v1/drivers/${encodeURIComponent(driver)}/channel-settings/schema`);
}

export function fetchProject() {
  return scadaClient.get<{
    title: string;
    file?: string;
    channel_count: number;
    rule_count: number;
    virtual_network_mode: string;
  }>('/api/v1/project');
}

export function patchProject(patch: {
  title?: string;
  virtual_network_mode?: string;
}) {
  return scadaClient.request<{
    title: string;
    file?: string;
    channel_count: number;
    rule_count: number;
    virtual_network_mode: string;
  }>('/api/v1/project', {
    method: 'PATCH',
    data: patch,
  });
}

export interface ScadaProjectFile {
  name: string;
  title: string;
  active: boolean;
}

export function listProjectFiles() {
  return scadaClient.get<{ files: string[]; projects: ScadaProjectFile[] }>(
    '/api/v1/project/files',
  );
}

export function deleteProjectFile(name: string) {
  return scadaClient.delete<{ ok: boolean; file: string; title: string }>(
    `/api/v1/project/files/${encodeURIComponent(name)}`,
  );
}

export function newProject(body: { title: string; name: string }) {
  return scadaClient.post<{ ok: boolean; file: string; title: string }>(
    '/api/v1/project/new',
    body,
  );
}

export function openProject(body: { name: string }) {
  return scadaClient.post<{ ok: boolean; file: string; title: string }>(
    '/api/v1/project/open',
    body,
  );
}

export function saveProject() {
  return scadaClient.post<{ ok: boolean; file: string }>(
    '/api/v1/project/save',
  );
}

export function saveProjectAs(body: { name: string }) {
  return scadaClient.post<{ ok: boolean; file: string }>(
    '/api/v1/project/save-as',
    body,
  );
}

export function reloadProject() {
  return scadaClient.post<{ ok: boolean }>('/api/v1/project/reload');
}

export interface ScadaRuntimeSnapshot {
  devices: number;
  online: number;
  uptime_sec: number;
  reads_total: number;
  writes_total: number;
  errors_total: number;
}

export interface ScadaDeviceSnapshot {
  id: string;
  name: string;
  driver: string;
  endpoint?: string;
  status: string;
  error?: string;
  diagnostics?: boolean;
  reads_total?: number;
  writes_total?: number;
  errors_total?: number;
}

export function fetchDiagnosticsRuntime() {
  return scadaClient.get<ScadaRuntimeSnapshot>('/api/v1/diagnostics/runtime');
}

export function fetchDiagnosticsDevice(id: string) {
  return scadaClient.get<ScadaDeviceSnapshot>(
    `/api/v1/diagnostics/devices/${encodeURIComponent(id)}`,
  );
}
