<script lang="ts" setup>
import type { ChannelPayload } from '../channel/ChannelForm.vue';

import type {
  ScadaChannelInfo,
  ScadaDevice,
  ScadaDeviceInfo,
  ScadaProjectFile,
  ScadaTagEntry,
} from '#/api/scada';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import {
  Page,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@vben/common-ui';
import {
  Activity,
  BookOpenText,
  ClipboardPaste,
  Copy,
  Cpu,
  FilePlus,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  PlugZap,
  RotateCw,
  Save,
  SaveAll,
  Scissors,
  Settings,
  Tag,
  Trash2,
  Undo2,
  Waypoints,
} from '@vben/icons';
import { $t } from '@vben/locales';

import {
  ElButton,
  ElDialog,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTag,
  ElTooltip,
  ElTree,
} from 'element-plus';

import {
  addClientRef,
  deleteChannelDevice,
  deleteDeviceTag,
  deleteProjectFile,
  fetchChannel,
  fetchChannelDevice,
  fetchChannelDevices,
  fetchChannels,
  fetchDeviceTags,
  fetchLiveTags,
  fetchProject,
  listProjectFiles,
  newProject,
  openProject,
  patchChannelDevice,
  reinitChannelDevice,
  reloadProject,
  removeClientRef,
  saveProject,
  saveProjectAs,
  scadaErrorMessage,
  scadaMqttLive,
} from '#/api/scada';

import ChannelForm from '../channel/ChannelForm.vue';
import DeviceForm from '../device/DeviceForm.vue';
import DevicePropsPanel from '../device/DevicePropsPanel.vue';
import TagForm from '../tag/TagForm.vue';
import DiagnosticsDrawer from './DiagnosticsDrawer.vue';
import EventLogPanel from './EventLogPanel.vue';
import ProjectPropsPanel from './ProjectPropsPanel.vue';
import ProjectSettingsDialog from './ProjectSettingsDialog.vue';

/** Tree: workspace → projects → channel → device (tags live in the object list). */
interface TreeNode {
  id: string;
  label: string;
  kind: 'channel' | 'device' | 'project' | 'workspace';
  file?: string;
  channel?: string;
  device?: string;
  driver?: string;
  children?: TreeNode[];
}

type ListKind = 'channel' | 'device' | 'project' | 'tag';

const TREE_ICONS = {
  workspace: FolderOpen,
  project: BookOpenText,
  channel: Waypoints,
  device: Cpu,
} as const;

function treeIconFor(kind: TreeNode['kind']) {
  return TREE_ICONS[kind] ?? FolderOpen;
}

interface ListRow {
  id: string;
  kind: ListKind;
  name: string;
  channel?: string;
  device?: string;
  driver?: string;
  file?: string;
  col2?: string;
  col3?: string;
  col4?: string;
  tag?: ScadaTagEntry;
}

const router = useRouter();
const filterText = ref('');
const createChannelVisible = ref(false);
const createDeviceVisible = ref(false);
const createTagVisible = ref(false);
const diagnosticsVisible = ref(false);
const projectSettingsVisible = ref(false);
const newProjectVisible = ref(false);
const openProjectVisible = ref(false);
const saveAsVisible = ref(false);
const fileBusy = ref(false);
const loading = ref(false);
const detailLoading = ref(false);
const projectTitle = ref('Runtime Project');
const projectFile = ref('');
const newProjectTitle = ref('Untitled');
const newProjectName = ref('');
const saveAsName = ref('');
const openProjectName = ref('');
const projectCatalog = ref<ScadaProjectFile[]>([]);
const channels = ref<ScadaChannelInfo[]>([]);
const devicesByChannel = ref<Record<string, ScadaDevice[]>>({});
const tagsByDevice = ref<Record<string, ScadaTagEntry[]>>({});
const connected = ref(false);
const lastError = ref('');

/** Left tree selection = parent context for the object list. */
const treeSelected = ref<null | TreeNode>(null);
/** Object-list selection drives the property sheet (falls back to tree). */
const listSelected = ref<ListRow | null>(null);

const channelDetail = ref<null | ScadaChannelInfo>(null);
const deviceDetail = ref<null | ScadaDeviceInfo>(null);
const tagDetail = ref<null | ScadaTagEntry>(null);

function deviceKey(channel: string, device: string) {
  return `${channel}\0${device}`;
}

function tagLivePath(
  channel: string,
  device: string,
  tag: ScadaTagEntry,
): string {
  let groups: string[] = [];
  if (tag.group?.length) {
    groups = tag.group;
  } else if (tag.group_path) {
    groups = tag.group_path.split('.').filter(Boolean);
  }
  return [channel, device, ...groups, tag.name].join('.');
}

function formatLiveValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Live samples keyed by Channel.Device[.Group].Tag (MQTT VTQ, HTTP poll fallback). */
const liveByPath = ref<Record<string, { value?: unknown; quality?: unknown }>>(
  {},
);
const subscribedPaths = ref<string[]>([]);
/** True when workspace live feed is on MQTT; false uses HTTP poll + client-ref. */
const liveViaMqtt = ref(false);
let livePollTimer: null | ReturnType<typeof setInterval> = null;

function applyLiveSample(path: string, value?: unknown, quality?: unknown) {
  liveByPath.value = {
    ...liveByPath.value,
    [path]: { value, quality },
  };
}

async function stopLiveCollect() {
  if (livePollTimer) {
    clearInterval(livePollTimer);
    livePollTimer = null;
  }
  const paths = [...subscribedPaths.value];
  subscribedPaths.value = [];
  liveByPath.value = {};
  const wasMqtt = liveViaMqtt.value;
  liveViaMqtt.value = false;
  await scadaMqttLive.clearSubscription();
  if (wasMqtt) return;
  await Promise.all(
    paths.map(async (path) => {
      try {
        await removeClientRef(path);
      } catch {
        // ignore
      }
    }),
  );
}

async function startLiveCollect(channel: string, device: string) {
  const key = deviceKey(channel, device);
  const tags = tagsByDevice.value[key] ?? [];
  const next = tags
    .filter((t) => (t.access || 'R').includes('R'))
    .map((t) => tagLivePath(channel, device, t));

  scadaMqttLive.setSlug(projectTitle.value);
  scadaMqttLive.setHandler((sample) => {
    applyLiveSample(sample.path, sample.value, sample.quality);
  });

  const mqttOk = await scadaMqttLive.subscribeDevice(channel, device);
  if (mqttOk) {
    // Drop HTTP poll / client-ref; broker subscribe owns interest + push.
    if (livePollTimer) {
      clearInterval(livePollTimer);
      livePollTimer = null;
    }
    if (!liveViaMqtt.value && subscribedPaths.value.length > 0) {
      await Promise.all(
        subscribedPaths.value.map(async (path) => {
          try {
            await removeClientRef(path);
          } catch {
            // ignore
          }
        }),
      );
    }
    liveViaMqtt.value = true;
    subscribedPaths.value = next;
    return;
  }

  // Fallback: HTTP client-ref + poll.
  liveViaMqtt.value = false;
  await scadaMqttLive.clearSubscription();
  const prev = new Set(subscribedPaths.value);
  const want = new Set(next);
  for (const path of subscribedPaths.value) {
    if (!want.has(path)) {
      try {
        await removeClientRef(path);
      } catch {
        // ignore
      }
    }
  }
  for (const path of next) {
    if (!prev.has(path)) {
      try {
        await addClientRef(path);
      } catch {
        // ignore; tag may not exist yet
      }
    }
  }
  subscribedPaths.value = next;
  if (!livePollTimer) {
    livePollTimer = setInterval(() => {
      void pollLiveValues();
    }, 500);
  }
  await pollLiveValues();
}

async function pollLiveValues() {
  if (liveViaMqtt.value || subscribedPaths.value.length === 0) return;
  try {
    const rows = await fetchLiveTags();
    const map: Record<string, { value?: unknown; quality?: unknown }> = {
      ...liveByPath.value,
    };
    const want = new Set(subscribedPaths.value);
    for (const row of rows) {
      if (!want.has(row.path)) continue;
      map[row.path] = { value: row.value, quality: row.quality };
    }
    liveByPath.value = map;
  } catch {
    // keep last
  }
}

const collectDevice = computed(() => {
  const n = treeSelected.value;
  if (n?.kind === 'device' && n.channel && n.device) {
    return { channel: n.channel, device: n.device };
  }
  const row = listSelected.value;
  if (row?.kind === 'tag' && row.channel && row.device) {
    return { channel: row.channel, device: row.device };
  }
  if (row?.kind === 'device' && row.channel && row.device) {
    return { channel: row.channel, device: row.device };
  }
  return null;
});

watch(
  [collectDevice, tagsByDevice],
  async ([dev]) => {
    if (!dev) {
      await stopLiveCollect();
      return;
    }
    await startLiveCollect(dev.channel, dev.device);
  },
  { deep: true },
);

watch(projectTitle, async (title) => {
  scadaMqttLive.setSlug(title);
  const dev = collectDevice.value;
  if (dev && liveViaMqtt.value) {
    await startLiveCollect(dev.channel, dev.device);
  }
});

const treeData = computed<TreeNode[]>(() => {
  const channelNodes: TreeNode[] = channels.value.map((ch) => ({
    id: `ch-${ch.name}`,
    label: `${ch.name} (${ch.driver})${ch.started ? '' : ` [${$t('scada.workspace.stopped')}]`}`,
    kind: 'channel' as const,
    channel: ch.name,
    driver: ch.driver,
    children: (devicesByChannel.value[ch.name] ?? []).map((d) => ({
      id: `ch-${ch.name}-dev-${d.name}`,
      label: d.name,
      kind: 'device' as const,
      channel: ch.name,
      device: d.name,
      driver: ch.driver,
    })),
  }));
  let catalog = projectCatalog.value;
  if (catalog.length === 0 && projectFile.value) {
    catalog = [
      {
        name: projectFile.value,
        title: projectTitle.value,
        active: true,
      },
    ];
  }
  return [
    {
      id: 'workspace',
      label: $t('scada.workspace.projects'),
      kind: 'workspace',
      children: catalog.map((p) => ({
        id: `proj-${p.name}`,
        label: p.title || p.name,
        kind: 'project' as const,
        file: p.name,
        children:
          p.active || p.name === projectFile.value ? channelNodes : undefined,
      })),
    },
  ];
});

const filteredTree = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  if (!q) return treeData.value;
  const walk = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .map((n) => {
        const kids = n.children ? walk(n.children) : undefined;
        if (n.label.toLowerCase().includes(q) || (kids && kids.length > 0)) {
          return { ...n, children: kids };
        }
        return null;
      })
      .filter(Boolean) as TreeNode[];
  return walk(treeData.value);
});

const treeChannelName = computed(() => {
  const n = treeSelected.value;
  if (!n) return '';
  if (n.kind === 'channel' || n.kind === 'device') return n.channel || '';
  return '';
});

const treeDeviceName = computed(() => {
  const n = treeSelected.value;
  if (n?.kind === 'device') return n.device || '';
  return '';
});

const selectedChannelDriver = computed(() => {
  const name = treeChannelName.value;
  return channels.value.find((c) => c.name === name)?.driver || 'modbus_tcp';
});

function driverForChannel(name: string) {
  if (!name) return selectedChannelDriver.value;
  return (
    channels.value.find((c) => c.name === name)?.driver ||
    selectedChannelDriver.value
  );
}

/** Children of the tree selection. */
const listRows = computed<ListRow[]>(() => {
  const n = treeSelected.value;
  if (!n || n.kind === 'workspace') {
    return projectCatalog.value.map((p) => ({
      id: `proj-${p.name}`,
      kind: 'project' as const,
      name: p.title || p.name,
      file: p.name,
      col2: p.name,
      col3: p.active
        ? $t('scada.workspace.projectOpened')
        : $t('scada.workspace.projectIdle'),
      col4: '',
    }));
  }
  if (n.kind === 'project' && n.file && n.file !== projectFile.value) {
    const hit = projectCatalog.value.find((p) => p.name === n.file);
    return [
      {
        id: `proj-${n.file}`,
        kind: 'project' as const,
        name: hit?.title || n.label,
        file: n.file,
        col2: n.file,
        col3: $t('scada.workspace.projectIdle'),
        col4: '',
      },
    ];
  }
  if (!n || n.kind === 'project') {
    return channels.value.map((ch) => ({
      id: `ch-${ch.name}`,
      kind: 'channel' as const,
      name: ch.name,
      channel: ch.name,
      driver: ch.driver,
      col2: ch.driver,
      col3: ch.started ? 'started' : 'idle',
      col4: String(ch.device_count ?? 0),
    }));
  }
  if (n.kind === 'channel' && n.channel) {
    return (devicesByChannel.value[n.channel] ?? []).map((d) => ({
      id: `ch-${n.channel}-dev-${d.name}`,
      kind: 'device' as const,
      name: d.name,
      channel: n.channel,
      device: d.name,
      driver: n.driver,
      col2: d.model || '-',
      col3: String(d.station_id ?? '-'),
      col4: String(d.scan_rate_ms ?? '-'),
    }));
  }
  if (n.kind === 'device' && n.channel && n.device) {
    const channelName = n.channel;
    const deviceName = n.device;
    const key = deviceKey(channelName, deviceName);
    return (tagsByDevice.value[key] ?? []).map((t) => {
      const path = tagLivePath(channelName, deviceName, t);
      const live = liveByPath.value[path];
      return {
        id: `ch-${channelName}-dev-${deviceName}-tag-${t.name}`,
        kind: 'tag' as const,
        name: t.name,
        channel: channelName,
        device: deviceName,
        driver: n.driver,
        col2: t.address || '-',
        col3: t.data_type || '-',
        col4: live ? formatLiveValue(live.value) : '-',
        tag: t,
      };
    });
  }
  return [];
});

const listColumns = computed(() => {
  const n = treeSelected.value;
  if (!n || n.kind === 'workspace') {
    return {
      title: $t('scada.workspace.listProjects'),
      c1: $t('scada.workspace.projectTitle'),
      c2: $t('scada.workspace.projectFile'),
      c3: $t('scada.diagnostics.status'),
      c4: '',
    };
  }
  if (n.kind === 'project' && n.file && n.file !== projectFile.value) {
    return {
      title: $t('scada.workspace.listProjects'),
      c1: $t('scada.workspace.projectTitle'),
      c2: $t('scada.workspace.projectFile'),
      c3: $t('scada.diagnostics.status'),
      c4: '',
    };
  }
  if (n.kind === 'project') {
    return {
      title: $t('scada.workspace.listChannels'),
      c1: $t('scada.channel.fields.name'),
      c2: $t('scada.channel.fields.driver'),
      c3: $t('scada.channel.fields.started'),
      c4: $t('scada.channel.fields.deviceCount'),
    };
  }
  if (n.kind === 'channel') {
    return {
      title: $t('scada.workspace.listDevices'),
      c1: $t('scada.device.fields.name'),
      c2: $t('scada.device.fields.model'),
      c3: $t('scada.device.fields.stationId'),
      c4: $t('scada.device.fields.scanRate'),
    };
  }
  return {
    title: $t('scada.workspace.listTags'),
    c1: $t('scada.tag.fields.name'),
    c2: $t('scada.tag.fields.address'),
    c3: $t('scada.tag.fields.dataType'),
    c4: $t('scada.tag.fields.value'),
  };
});

/** What the property pane is editing. */
const propsFocus = computed<'channel' | 'device' | 'empty' | 'project' | 'tag'>(
  () => {
    if (listSelected.value) {
      if (listSelected.value.kind === 'project') {
        return listSelected.value.file === projectFile.value
          ? 'project'
          : 'empty';
      }
      return listSelected.value.kind;
    }
    const n = treeSelected.value;
    if (!n || n.kind === 'workspace') return 'empty';
    if (n.kind === 'project') {
      return n.file === projectFile.value ? 'project' : 'empty';
    }
    if (n.kind === 'channel') return 'channel';
    if (n.kind === 'device') return 'device';
    return 'empty';
  },
);

const propsChannelName = computed(() => {
  if (listSelected.value?.channel) return listSelected.value.channel;
  return treeChannelName.value;
});

const propsDeviceName = computed(() => {
  if (
    listSelected.value?.kind === 'device' ||
    listSelected.value?.kind === 'tag'
  ) {
    return listSelected.value.device || '';
  }
  return treeDeviceName.value;
});

const canNewDevice = computed(() => !!treeChannelName.value);
const canNewTag = computed(
  () =>
    !!(propsChannelName.value || treeChannelName.value) &&
    !!(propsDeviceName.value || treeDeviceName.value),
);
const selectedProjectFile = computed(() => {
  if (listSelected.value?.kind === 'project' && listSelected.value.file) {
    return listSelected.value.file;
  }
  if (treeSelected.value?.kind === 'project' && treeSelected.value.file) {
    return treeSelected.value.file;
  }
  return '';
});

const projectFileToDelete = computed(
  () => selectedProjectFile.value || projectFile.value,
);

const canDelete = computed(
  () => propsFocus.value === 'device' || propsFocus.value === 'tag',
);

function onToolbarDelete() {
  if (propsFocus.value === 'tag') void onDeleteTag();
  else if (propsFocus.value === 'device') void onDeleteDevice();
}

const diagnosticsDeviceId = computed(() => {
  if (deviceDetail.value?.id) return deviceDetail.value.id;
  if (deviceDetail.value?.name) return deviceDetail.value.name;
  return propsDeviceName.value || '';
});

async function loadDevicesForChannels(list: ScadaChannelInfo[]) {
  const entries = await Promise.all(
    list.map(async (ch) => {
      try {
        const devices = await fetchChannelDevices(ch.name);
        return [ch.name, (devices ?? []) as ScadaDevice[]] as const;
      } catch {
        return [ch.name, [] as ScadaDevice[]] as const;
      }
    }),
  );
  const map: Record<string, ScadaDevice[]> = {};
  for (const [name, devices] of entries) {
    map[name] = devices;
  }
  devicesByChannel.value = map;

  const tagEntries = await Promise.all(
    list.flatMap((ch) =>
      (map[ch.name] ?? []).map(async (d) => {
        const key = deviceKey(ch.name, d.name);
        try {
          const res = await fetchDeviceTags(ch.name, d.name);
          return [key, (res.tags ?? []) as ScadaTagEntry[]] as const;
        } catch {
          return [key, [] as ScadaTagEntry[]] as const;
        }
      }),
    ),
  );
  const tmap: Record<string, ScadaTagEntry[]> = {};
  for (const [key, tags] of tagEntries) {
    tmap[key] = tags;
  }
  tagsByDevice.value = tmap;
}

async function loadChannelDetail(name: string) {
  detailLoading.value = true;
  deviceDetail.value = null;
  tagDetail.value = null;
  try {
    channelDetail.value = await fetchChannel(name);
  } catch (error) {
    channelDetail.value = null;
    ElMessage.error(scadaErrorMessage(error));
  } finally {
    detailLoading.value = false;
  }
}

async function onChannelPropsSaved() {
  await refresh();
}

async function loadDeviceDetail(channel: string, device: string) {
  detailLoading.value = true;
  channelDetail.value = null;
  tagDetail.value = null;
  try {
    deviceDetail.value = await fetchChannelDevice(channel, device);
    const key = deviceKey(channel, device);
    try {
      const res = await fetchDeviceTags(channel, device);
      tagsByDevice.value = { ...tagsByDevice.value, [key]: res.tags ?? [] };
    } catch {
      // keep prior
    }
  } catch (error) {
    deviceDetail.value = null;
    ElMessage.error(scadaErrorMessage(error));
  } finally {
    detailLoading.value = false;
  }
}

function loadTagDetail(channel: string, device: string, tag: string) {
  channelDetail.value = null;
  deviceDetail.value = null;
  const key = deviceKey(channel, device);
  const list = tagsByDevice.value[key] ?? [];
  tagDetail.value = list.find((t) => t.name === tag) ?? {
    name: tag,
    address: '',
  };
}

async function syncPropsFromSelection() {
  if (listSelected.value) {
    const row = listSelected.value;
    if (row.kind === 'channel' && row.channel) {
      await loadChannelDetail(row.channel);
    } else if (row.kind === 'device' && row.channel && row.device) {
      await loadDeviceDetail(row.channel, row.device);
    } else if (row.kind === 'tag' && row.channel && row.device) {
      loadTagDetail(row.channel, row.device, row.name);
    }
    return;
  }
  const n = treeSelected.value;
  if (!n || n.kind === 'workspace' || n.kind === 'project') {
    channelDetail.value = null;
    deviceDetail.value = null;
    tagDetail.value = null;
    return;
  }
  if (n.kind === 'channel' && n.channel) {
    await loadChannelDetail(n.channel);
  } else if (n.kind === 'device' && n.channel && n.device) {
    await loadDeviceDetail(n.channel, n.device);
  }
}

async function refresh() {
  loading.value = true;
  lastError.value = '';
  try {
    const [proj, list, files] = await Promise.all([
      fetchProject(),
      fetchChannels(),
      listProjectFiles(),
    ]);
    projectTitle.value = proj.title || 'Runtime Project';
    projectFile.value = proj.file || '';
    projectCatalog.value = files.projects ?? [];
    channels.value = list ?? [];
    await loadDevicesForChannels(channels.value);
    connected.value = true;
    if (!treeSelected.value) {
      const active =
        projectCatalog.value.find((p) => p.active) || projectCatalog.value[0];
      if (active) {
        treeSelected.value = {
          id: `proj-${active.name}`,
          label: active.title || active.name,
          kind: 'project',
          file: active.name,
        };
      }
    }
    await syncPropsFromSelection();
  } catch (error) {
    connected.value = false;
    lastError.value = scadaErrorMessage(error);
    ElMessage.error(
      `${$t('scada.workspace.disconnected')}: ${lastError.value}`,
    );
  } finally {
    loading.value = false;
  }
}

function resetSelection() {
  treeSelected.value = null;
  listSelected.value = null;
  channelDetail.value = null;
  deviceDetail.value = null;
  tagDetail.value = null;
  devicesByChannel.value = {};
  tagsByDevice.value = {};
}

async function onReloadProject() {
  try {
    await reloadProject();
    ElMessage.success($t('scada.workspace.reloadOk'));
    await refresh();
  } catch (error) {
    ElMessage.error(scadaErrorMessage(error));
  }
}

function openNewProjectDialog() {
  newProjectTitle.value = 'Untitled';
  newProjectName.value = '';
  newProjectVisible.value = true;
}

async function openOpenProjectDialog() {
  openProjectName.value = '';
  try {
    const res = await listProjectFiles();
    projectCatalog.value = res.projects ?? [];
    if (projectCatalog.value.length === 0) {
      ElMessage.warning($t('scada.workspace.noProjectFiles'));
      return;
    }
    openProjectName.value =
      projectFile.value || projectCatalog.value[0]?.name || '';
    openProjectVisible.value = true;
  } catch (error) {
    ElMessage.error(scadaErrorMessage(error));
  }
}

function openSaveAsDialog() {
  const base = projectFile.value.replace(/\.json$/i, '') || 'project';
  saveAsName.value = `${base}_copy`;
  saveAsVisible.value = true;
}

async function onNewProjectSubmit() {
  const name = newProjectName.value.trim();
  const title = newProjectTitle.value.trim() || 'Untitled';
  if (!name) {
    ElMessage.warning($t('scada.workspace.projectName'));
    return;
  }
  fileBusy.value = true;
  try {
    const res = await newProject({ title, name });
    projectFile.value = res.file;
    projectTitle.value = res.title || title;
    newProjectVisible.value = false;
    resetSelection();
    ElMessage.success($t('scada.workspace.newProjectOk'));
    await refresh();
  } catch (error) {
    ElMessage.error(scadaErrorMessage(error));
  } finally {
    fileBusy.value = false;
  }
}

async function onOpenProjectSubmit() {
  const name = openProjectName.value.trim();
  if (!name) {
    ElMessage.warning($t('scada.workspace.selectProjectFile'));
    return;
  }
  fileBusy.value = true;
  try {
    const res = await openProject({ name });
    projectFile.value = res.file;
    projectTitle.value = res.title || projectTitle.value;
    openProjectVisible.value = false;
    resetSelection();
    ElMessage.success($t('scada.workspace.openProjectOk'));
    await refresh();
  } catch (error) {
    ElMessage.error(scadaErrorMessage(error));
  } finally {
    fileBusy.value = false;
  }
}

async function onSaveProject() {
  fileBusy.value = true;
  try {
    const res = await saveProject();
    projectFile.value = res.file;
    ElMessage.success($t('scada.workspace.saveProjectOk'));
  } catch (error) {
    ElMessage.error(scadaErrorMessage(error));
  } finally {
    fileBusy.value = false;
  }
}

async function onSaveProjectAsSubmit() {
  const name = saveAsName.value.trim();
  if (!name) {
    ElMessage.warning($t('scada.workspace.projectName'));
    return;
  }
  fileBusy.value = true;
  try {
    const res = await saveProjectAs({ name });
    projectFile.value = res.file;
    saveAsVisible.value = false;
    ElMessage.success($t('scada.workspace.saveProjectAsOk'));
  } catch (error) {
    ElMessage.error(scadaErrorMessage(error));
  } finally {
    fileBusy.value = false;
  }
}

function onTreeSelect(data: TreeNode) {
  const same = treeSelected.value?.id === data.id;
  treeSelected.value = data;
  listSelected.value = null;
  if (
    same &&
    data.kind === 'project' &&
    data.file &&
    data.file !== projectFile.value
  ) {
    void switchToProject(data.file);
    return;
  }
  void syncPropsFromSelection();
}

function onListSelect(row: ListRow) {
  const same = listSelected.value?.id === row.id;
  if (row.kind === 'project' && row.file) {
    treeSelected.value = {
      id: `proj-${row.file}`,
      label: row.name,
      kind: 'project',
      file: row.file,
    };
    if (same && row.file !== projectFile.value) {
      void switchToProject(row.file);
      return;
    }
  }
  listSelected.value = row;
  void syncPropsFromSelection();
}

async function switchToProject(name: string) {
  if (!name || name === projectFile.value) return;
  fileBusy.value = true;
  try {
    await openProject({ name });
    resetSelection();
    await refresh();
  } catch (error) {
    ElMessage.error(scadaErrorMessage(error));
  } finally {
    fileBusy.value = false;
  }
}

async function onDeleteProject() {
  const name = projectFileToDelete.value;
  if (!name) return;
  try {
    await ElMessageBox.confirm(
      $t('scada.workspace.confirmDeleteProject', { name }),
      $t('scada.workspace.deleteProject'),
      { type: 'warning' },
    );
    const res = await deleteProjectFile(name);
    ElMessage.success($t('scada.workspace.deleteProjectOk'));
    resetSelection();
    projectFile.value = res.file || projectFile.value;
    if (res.title) projectTitle.value = res.title;
    await refresh();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(scadaErrorMessage(error));
  }
}

function openCreateChannelPage() {
  router.push({ name: 'ScadaChannelCreate' });
}

function openCreateChannelDialog() {
  createChannelVisible.value = true;
}

function openCreateDeviceDialog() {
  if (!treeChannelName.value) {
    ElMessage.warning($t('scada.device.errors.selectChannel'));
    return;
  }
  createDeviceVisible.value = true;
}

function openCreateTagDialog() {
  const ch = propsChannelName.value || treeChannelName.value;
  const dev = propsDeviceName.value || treeDeviceName.value;
  if (!ch || !dev) {
    ElMessage.warning($t('scada.tag.errors.selectDevice'));
    return;
  }
  createTagVisible.value = true;
}

async function onChannelSubmit(_payload: ChannelPayload) {
  createChannelVisible.value = false;
  await refresh();
}

async function onDeviceSubmit(_name: string) {
  createDeviceVisible.value = false;
  await refresh();
}

async function onTagSubmit(_name: string) {
  createTagVisible.value = false;
  await refresh();
  await syncPropsFromSelection();
}

function onDevicePropsSaved(info: ScadaDeviceInfo) {
  deviceDetail.value = info;
}

async function onToggleEnabled() {
  const d = deviceDetail.value;
  const ch = propsChannelName.value;
  const name = propsDeviceName.value;
  if (!d || !ch || !name) return;
  try {
    deviceDetail.value = await patchChannelDevice(ch, name, {
      enabled: !d.enabled,
    });
    ElMessage.success($t('scada.device.success.patched'));
  } catch (error) {
    ElMessage.error(
      `${$t('scada.device.errors.patchFailed')}: ${scadaErrorMessage(error)}`,
    );
  }
}

async function onReinit() {
  const ch = propsChannelName.value;
  const name = propsDeviceName.value;
  if (!ch || !name) return;
  try {
    const info = await reinitChannelDevice(ch, name);
    if (info && 'name' in info) {
      deviceDetail.value = info as ScadaDeviceInfo;
    } else {
      await loadDeviceDetail(ch, name);
    }
    ElMessage.success($t('scada.device.success.reinit'));
  } catch (error) {
    ElMessage.error(
      `${$t('scada.device.errors.reinitFailed')}: ${scadaErrorMessage(error)}`,
    );
  }
}

async function onDeleteDevice() {
  const ch = propsChannelName.value;
  const name = propsDeviceName.value;
  if (!ch || !name) return;
  try {
    await ElMessageBox.confirm(
      $t('scada.device.confirmDelete', { name }),
      $t('scada.workspace.deleteDevice'),
      { type: 'warning' },
    );
    await deleteChannelDevice(ch, name);
    ElMessage.success($t('scada.device.success.deleted'));
    listSelected.value = null;
    if (treeSelected.value?.kind === 'device') {
      treeSelected.value = {
        id: `ch-${ch}`,
        label: ch,
        kind: 'channel',
        channel: ch,
      };
    }
    deviceDetail.value = null;
    await refresh();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(
      `${$t('scada.device.errors.deleteFailed')}: ${scadaErrorMessage(error)}`,
    );
  }
}

async function onDeleteTag() {
  const ch = propsChannelName.value;
  const dev = propsDeviceName.value;
  const name = tagDetail.value?.name || listSelected.value?.name;
  if (!ch || !dev || !name) return;
  try {
    await ElMessageBox.confirm(
      $t('scada.tag.confirmDelete', { name }),
      $t('scada.tag.detail'),
      { type: 'warning' },
    );
    await deleteDeviceTag(ch, dev, name);
    ElMessage.success($t('scada.tag.success.deleted'));
    listSelected.value = null;
    tagDetail.value = null;
    await refresh();
    await loadDeviceDetail(ch, dev);
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(
      `${$t('scada.tag.errors.deleteFailed')}: ${scadaErrorMessage(error)}`,
    );
  }
}

onMounted(() => {
  void refresh();
});

onUnmounted(() => {
  void stopLiveCollect();
  void scadaMqttLive.disconnect();
});

function onMenuCommand(cmd: string) {
  switch (cmd) {
    case 'newProject': {
      openNewProjectDialog();
      break;
    }
    case 'openProject': {
      void openOpenProjectDialog();
      break;
    }
    case 'saveProject': {
      void onSaveProject();
      break;
    }
    case 'saveProjectAs': {
      openSaveAsDialog();
      break;
    }
    case 'newChannel': {
      openCreateChannelDialog();
      break;
    }
    case 'newDevice': {
      openCreateDeviceDialog();
      break;
    }
    case 'newTag': {
      openCreateTagDialog();
      break;
    }
    case 'channelPage': {
      openCreateChannelPage();
      break;
    }
    case 'refresh': {
      void refresh();
      break;
    }
    case 'reload': {
      void onReloadProject();
      break;
    }
    case 'diagnostics': {
      diagnosticsVisible.value = true;
      break;
    }
    case 'projectSettings': {
      projectSettingsVisible.value = true;
      break;
    }
    case 'reinit': {
      void onReinit();
      break;
    }
    case 'deleteProject': {
      void onDeleteProject();
      break;
    }
    case 'deleteDevice': {
      void onDeleteDevice();
      break;
    }
    case 'deleteTag': {
      void onDeleteTag();
      break;
    }
    default: {
      break;
    }
  }
}
</script>

<template>
  <Page
    auto-content-height
    content-class="flex h-full min-h-0 flex-col overflow-hidden !p-0"
  >
    <!-- Full client chrome: menu | toolbar | body | status -->
    <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <!-- Menu bar -->
      <nav
        class="bg-card flex h-8 shrink-0 items-center gap-0 border-b px-1 text-sm"
        aria-label="menu"
      >
        <ElDropdown trigger="click" @command="onMenuCommand">
          <button type="button" class="hover:bg-muted rounded px-3 py-1">
            {{ $t('scada.workspace.menu.file') }}
          </button>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="newProject">
                {{ $t('scada.workspace.newProject') }}
              </ElDropdownItem>
              <ElDropdownItem command="openProject">
                {{ $t('scada.workspace.openProject') }}
              </ElDropdownItem>
              <ElDropdownItem divided command="saveProject">
                {{ $t('scada.workspace.saveProject') }}
              </ElDropdownItem>
              <ElDropdownItem command="saveProjectAs">
                {{ $t('scada.workspace.saveProjectAs') }}
              </ElDropdownItem>
              <ElDropdownItem divided command="deleteProject">
                {{ $t('scada.workspace.deleteProject') }}
              </ElDropdownItem>
              <ElDropdownItem divided command="reload">
                {{ $t('scada.workspace.reload') }}
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>

        <ElDropdown trigger="click" @command="onMenuCommand">
          <button type="button" class="hover:bg-muted rounded px-3 py-1">
            {{ $t('scada.workspace.menu.edit') }}
          </button>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="newChannel">
                {{ $t('scada.workspace.newChannel') }}
              </ElDropdownItem>
              <ElDropdownItem command="newDevice">
                {{ $t('scada.workspace.newDevice') }}
              </ElDropdownItem>
              <ElDropdownItem command="newTag">
                {{ $t('scada.workspace.newTag') }}
              </ElDropdownItem>
              <ElDropdownItem divided command="deleteProject">
                {{ $t('scada.workspace.deleteProject') }}
              </ElDropdownItem>
              <ElDropdownItem command="deleteDevice">
                {{ $t('scada.workspace.deleteDevice') }}
              </ElDropdownItem>
              <ElDropdownItem command="deleteTag">
                {{ $t('scada.workspace.deleteTag') }}
              </ElDropdownItem>
              <ElDropdownItem divided command="projectSettings">
                {{ $t('scada.workspace.projectSettings') }}
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>

        <ElDropdown trigger="click" @command="onMenuCommand">
          <button type="button" class="hover:bg-muted rounded px-3 py-1">
            {{ $t('scada.workspace.menu.view') }}
          </button>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="refresh">
                {{ $t('scada.workspace.refresh') }}
              </ElDropdownItem>
              <ElDropdownItem command="diagnostics">
                {{ $t('scada.workspace.diagnostics') }}
              </ElDropdownItem>
              <ElDropdownItem command="channelPage">
                {{ $t('scada.workspace.channelPage') }}
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>

        <ElDropdown trigger="click" @command="onMenuCommand">
          <button type="button" class="hover:bg-muted rounded px-3 py-1">
            {{ $t('scada.workspace.menu.tools') }}
          </button>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="reinit">
                {{ $t('scada.workspace.reinit') }}
              </ElDropdownItem>
              <ElDropdownItem command="diagnostics">
                {{ $t('scada.workspace.diagnostics') }}
              </ElDropdownItem>
              <ElDropdownItem divided command="projectSettings">
                {{ $t('scada.workspace.projectSettings') }}
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
      </nav>

      <!-- Toolbar: file ops, new objects, clipboard, runtime (icon buttons) -->
      <div
        class="bg-muted/30 flex h-10 shrink-0 items-center gap-0.5 border-b px-1"
        aria-label="toolbar"
      >
        <ElTooltip
          :content="$t('scada.workspace.newProject')"
          placement="bottom"
        >
          <span class="inline-flex">
            <ElButton
              text
              class="!h-8 !w-8 !p-0"
              :disabled="fileBusy"
              @click="openNewProjectDialog"
            >
              <FilePlus class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip
          :content="$t('scada.workspace.openProject')"
          placement="bottom"
        >
          <span class="inline-flex">
            <ElButton
              text
              class="!h-8 !w-8 !p-0"
              :disabled="fileBusy"
              @click="openOpenProjectDialog"
            >
              <FolderOpen class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip
          :content="$t('scada.workspace.saveProject')"
          placement="bottom"
        >
          <span class="inline-flex">
            <ElButton
              text
              class="!h-8 !w-8 !p-0"
              :disabled="fileBusy"
              @click="onSaveProject"
            >
              <Save class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip
          :content="$t('scada.workspace.saveProjectAs')"
          placement="bottom"
        >
          <span class="inline-flex">
            <ElButton
              text
              class="!h-8 !w-8 !p-0"
              :disabled="fileBusy"
              @click="openSaveAsDialog"
            >
              <SaveAll class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip
          :content="$t('scada.workspace.deleteProject')"
          placement="bottom"
        >
          <span class="inline-flex">
            <ElButton
              text
              class="!h-8 !w-8 !p-0"
              :disabled="fileBusy || !projectFileToDelete"
              @click="onDeleteProject"
            >
              <FolderMinus class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>

        <span class="bg-border mx-1 h-5 w-px"></span>

        <ElTooltip
          :content="$t('scada.workspace.newChannel')"
          placement="bottom"
        >
          <span class="inline-flex">
            <ElButton
              text
              class="!h-8 !w-8 !p-0"
              @click="openCreateChannelDialog"
            >
              <Waypoints class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip
          :content="$t('scada.workspace.newDevice')"
          placement="bottom"
        >
          <span class="inline-flex">
            <ElButton
              text
              class="!h-8 !w-8 !p-0"
              :disabled="!canNewDevice"
              @click="openCreateDeviceDialog"
            >
              <Cpu class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip
          :content="$t('scada.workspace.tagGroupSoon')"
          placement="bottom"
        >
          <span class="inline-flex">
            <ElButton text class="!h-8 !w-8 !p-0" disabled>
              <FolderPlus class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip :content="$t('scada.workspace.newTag')" placement="bottom">
          <span class="inline-flex">
            <ElButton
              text
              class="!h-8 !w-8 !p-0"
              :disabled="!canNewTag"
              @click="openCreateTagDialog"
            >
              <Tag class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>

        <span class="bg-border mx-1 h-5 w-px"></span>

        <ElTooltip :content="$t('scada.workspace.cutSoon')" placement="bottom">
          <span class="inline-flex">
            <ElButton text class="!h-8 !w-8 !p-0" disabled>
              <Scissors class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip :content="$t('scada.workspace.copySoon')" placement="bottom">
          <span class="inline-flex">
            <ElButton text class="!h-8 !w-8 !p-0" disabled>
              <Copy class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip
          :content="$t('scada.workspace.pasteSoon')"
          placement="bottom"
        >
          <span class="inline-flex">
            <ElButton text class="!h-8 !w-8 !p-0" disabled>
              <ClipboardPaste class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip
          :content="
            propsFocus === 'tag'
              ? $t('scada.workspace.deleteTag')
              : $t('scada.workspace.deleteDevice')
          "
          placement="bottom"
        >
          <span class="inline-flex">
            <ElButton
              text
              class="!h-8 !w-8 !p-0"
              :disabled="!canDelete"
              @click="onToolbarDelete"
            >
              <Trash2 class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>

        <span class="bg-border mx-1 h-5 w-px"></span>

        <ElTooltip :content="$t('scada.workspace.undoSoon')" placement="bottom">
          <span class="inline-flex">
            <ElButton text class="!h-8 !w-8 !p-0" disabled>
              <Undo2 class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>

        <span class="bg-border mx-1 h-5 w-px"></span>

        <ElTooltip :content="$t('scada.workspace.refresh')" placement="bottom">
          <span class="inline-flex">
            <ElButton
              text
              class="!h-8 !w-8 !p-0"
              :loading="loading"
              @click="refresh"
            >
              <PlugZap v-if="!loading" class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip :content="$t('scada.workspace.reload')" placement="bottom">
          <span class="inline-flex">
            <ElButton text class="!h-8 !w-8 !p-0" @click="onReloadProject">
              <RotateCw class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip
          :content="$t('scada.workspace.diagnostics')"
          placement="bottom"
        >
          <span class="inline-flex">
            <ElButton
              text
              class="!h-8 !w-8 !p-0"
              @click="diagnosticsVisible = true"
            >
              <Activity class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
        <ElTooltip
          :content="$t('scada.workspace.projectSettings')"
          placement="bottom"
        >
          <span class="inline-flex">
            <ElButton
              text
              class="!h-8 !w-8 !p-0"
              @click="projectSettingsVisible = true"
            >
              <Settings class="size-4" />
            </ElButton>
          </span>
        </ElTooltip>
      </div>

      <!-- Body: tree | list | props (right); Event Log (bottom) — Godot-style resizable docks -->
      <div
        class="flex min-h-0 flex-1 flex-col overflow-hidden"
        v-loading="loading"
      >
        <ResizablePanelGroup direction="vertical" class="h-full min-h-0 w-full">
          <ResizablePanel :default-size="72" :min-size="35">
            <ResizablePanelGroup
              direction="horizontal"
              class="h-full min-h-0 w-full"
            >
              <ResizablePanel :default-size="14" :min-size="8" :max-size="40">
                <aside class="bg-muted/20 flex h-full min-h-0 flex-col">
                  <div
                    class="border-b px-3 py-2 text-xs font-semibold tracking-wide uppercase opacity-70"
                  >
                    {{ $t('scada.workspace.projectTree') }}
                  </div>
                  <div class="shrink-0 p-2">
                    <ElInput
                      v-model="filterText"
                      clearable
                      size="small"
                      :placeholder="$t('scada.workspace.filter')"
                    />
                  </div>
                  <div class="min-h-0 flex-1 overflow-auto px-1 pb-2">
                    <ElTree
                      :data="filteredTree"
                      node-key="id"
                      :current-node-key="treeSelected?.id"
                      default-expand-all
                      highlight-current
                      :props="{ label: 'label', children: 'children' }"
                      @node-click="onTreeSelect"
                    >
                      <template #default="{ data }">
                        <span class="inline-flex min-w-0 items-center gap-1.5">
                          <component
                            :is="treeIconFor(data.kind)"
                            class="text-muted-foreground size-3.5 shrink-0"
                          />
                          <span class="truncate">{{ data.label }}</span>
                        </span>
                      </template>
                    </ElTree>
                  </div>
                </aside>
              </ResizablePanel>

              <ResizableHandle
                class="bg-border hover:bg-primary/40 data-[resize-handle-active]:bg-primary/50 w-1 transition-colors"
              />

              <ResizablePanel :default-size="58" :min-size="20">
                <section
                  class="flex h-full min-h-0 min-w-0 flex-col"
                  v-loading="detailLoading"
                >
                  <div
                    class="bg-muted/30 flex shrink-0 items-center justify-between border-b px-3 py-2"
                  >
                    <span class="text-sm font-medium">{{
                      listColumns.title
                    }}</span>
                    <span v-if="lastError" class="text-xs text-red-500">
                      {{ lastError }}
                    </span>
                  </div>
                  <div class="min-h-0 flex-1 overflow-auto">
                    <div
                      v-if="!listRows.length"
                      class="text-muted-foreground px-3 py-6 text-sm"
                    >
                      {{
                        connected
                          ? $t('scada.workspace.listEmpty')
                          : $t('scada.workspace.connectHint')
                      }}
                    </div>
                    <table v-else class="w-full text-left text-sm">
                      <thead
                        class="bg-muted/20 sticky top-0 text-xs opacity-70"
                      >
                        <tr>
                          <th class="px-3 py-2 font-medium">
                            {{ listColumns.c1 }}
                          </th>
                          <th class="px-3 py-2 font-medium">
                            {{ listColumns.c2 }}
                          </th>
                          <th class="px-3 py-2 font-medium">
                            {{ listColumns.c3 }}
                          </th>
                          <th class="px-3 py-2 font-medium">
                            {{ listColumns.c4 }}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="row in listRows"
                          :key="row.id"
                          class="hover:bg-muted/40 cursor-pointer border-t"
                          :class="
                            listSelected?.id === row.id
                              ? 'bg-primary/10'
                              : undefined
                          "
                          @click="onListSelect(row)"
                        >
                          <td class="px-3 py-2 font-medium">{{ row.name }}</td>
                          <td class="text-muted-foreground px-3 py-2">
                            {{ row.col2 }}
                          </td>
                          <td class="text-muted-foreground px-3 py-2">
                            {{ row.col3 }}
                          </td>
                          <td class="text-muted-foreground px-3 py-2">
                            {{ row.col4 }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </ResizablePanel>

              <ResizableHandle
                class="bg-border hover:bg-primary/40 data-[resize-handle-active]:bg-primary/50 w-1 transition-colors"
              />

              <ResizablePanel :default-size="28" :min-size="16" :max-size="50">
                <aside
                  class="flex h-full min-h-0 flex-col overflow-hidden"
                  v-loading="detailLoading"
                >
                  <div
                    class="bg-muted/30 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
                  >
                    <span class="text-xs font-medium">
                      {{ $t('scada.workspace.propertySheet') }}
                      <span
                        v-if="propsFocus !== 'empty'"
                        class="text-muted-foreground font-normal"
                      >
                        ·
                        {{
                          propsFocus === 'project'
                            ? projectTitle
                            : propsFocus === 'channel'
                              ? channelDetail?.name || propsChannelName
                              : propsFocus === 'device'
                                ? deviceDetail?.name || propsDeviceName
                                : tagDetail?.name
                        }}
                      </span>
                    </span>
                    <div
                      v-if="propsFocus === 'device' && deviceDetail"
                      class="flex flex-wrap gap-1"
                    >
                      <ElButton
                        size="small"
                        type="primary"
                        @click="openCreateTagDialog"
                      >
                        {{ $t('scada.workspace.newTag') }}
                      </ElButton>
                      <ElButton size="small" @click="onToggleEnabled">
                        {{
                          deviceDetail.enabled
                            ? $t('scada.workspace.disable')
                            : $t('scada.workspace.enable')
                        }}
                      </ElButton>
                      <ElButton size="small" @click="onReinit">
                        {{ $t('scada.workspace.reinit') }}
                      </ElButton>
                      <ElButton
                        size="small"
                        type="danger"
                        @click="onDeleteDevice"
                      >
                        {{ $t('scada.workspace.deleteDevice') }}
                      </ElButton>
                    </div>
                    <div
                      v-else-if="propsFocus === 'tag' && tagDetail"
                      class="flex gap-1"
                    >
                      <ElButton size="small" type="danger" @click="onDeleteTag">
                        {{ $t('scada.workspace.deleteTag') }}
                      </ElButton>
                    </div>
                  </div>

                  <div class="min-h-0 flex-1 overflow-auto p-3">
                    <div
                      v-if="propsFocus === 'empty'"
                      class="text-muted-foreground text-xs"
                    >
                      {{ $t('scada.workspace.selectTreeOrList') }}
                    </div>

                    <ProjectPropsPanel
                      v-else-if="propsFocus === 'project'"
                      :key="projectFile || 'project'"
                      @saved="refresh"
                    />

                    <template
                      v-else-if="propsFocus === 'channel' && channelDetail"
                    >
                      <ChannelForm
                        :key="channelDetail.name"
                        mode="edit"
                        embed
                        :show-preview="false"
                        :initial="channelDetail"
                        @saved="onChannelPropsSaved"
                      />
                      <p class="text-muted-foreground mt-3 text-xs">
                        {{ $t('scada.workspace.channelPropsHint') }}
                      </p>
                    </template>

                    <DevicePropsPanel
                      v-else-if="
                        propsFocus === 'device' &&
                        deviceDetail &&
                        propsChannelName
                      "
                      :channel="propsChannelName"
                      :driver="selectedChannelDriver"
                      :device="deviceDetail"
                      @saved="onDevicePropsSaved"
                    />

                    <TagForm
                      v-else-if="
                        propsFocus === 'tag' &&
                        tagDetail &&
                        propsChannelName &&
                        propsDeviceName
                      "
                      embed
                      :channel="propsChannelName"
                      :device="propsDeviceName"
                      :driver="driverForChannel(propsChannelName)"
                      :edit-name="tagDetail.name"
                      :show-cancel="false"
                      :initial="{
                        name: tagDetail.name,
                        address: tagDetail.address,
                        data_type: tagDetail.data_type,
                        access: tagDetail.access,
                        description: tagDetail.description,
                        scan_rate_ms: tagDetail.scan_rate_ms,
                        respect_client_type: tagDetail.respect_client_type,
                        scaling: tagDetail.scaling,
                        group: tagDetail.group_path,
                      }"
                      @submit="onTagSubmit"
                    />
                  </div>
                </aside>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle
            class="bg-border hover:bg-primary/40 data-[resize-handle-active]:bg-primary/50 h-1 transition-colors"
          />

          <ResizablePanel :default-size="28" :min-size="12" :max-size="55">
            <EventLogPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <!-- Status bar -->
      <footer
        class="bg-card text-muted-foreground flex h-7 shrink-0 items-center justify-between border-t px-3 text-xs"
      >
        <span>
          <template v-if="projectFile">{{ projectFile }} · </template>
          {{ projectTitle }}
          <template v-if="treeSelected">
            ·
            {{
              treeSelected.kind === 'workspace'
                ? $t('scada.workspace.projects')
                : treeSelected.label
            }}
          </template>
        </span>
        <ElTag size="small" :type="connected ? 'success' : 'danger'">
          {{
            connected
              ? $t('scada.workspace.connected')
              : $t('scada.workspace.disconnected')
          }}
        </ElTag>
      </footer>
    </div>

    <ElDialog
      v-model="newProjectVisible"
      :title="$t('scada.workspace.newProject')"
      width="420px"
      destroy-on-close
    >
      <ElForm label-position="top" @submit.prevent="onNewProjectSubmit">
        <ElFormItem :label="$t('scada.workspace.projectTitle')">
          <ElInput v-model="newProjectTitle" />
        </ElFormItem>
        <ElFormItem :label="$t('scada.workspace.projectName')">
          <ElInput
            v-model="newProjectName"
            :placeholder="$t('scada.workspace.projectNameHint')"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="newProjectVisible = false">
          {{ $t('scada.tag.cancel') }}
        </ElButton>
        <ElButton
          type="primary"
          :loading="fileBusy"
          @click="onNewProjectSubmit"
        >
          {{ $t('scada.workspace.newProject') }}
        </ElButton>
      </template>
    </ElDialog>

    <ElDialog
      v-model="openProjectVisible"
      :title="$t('scada.workspace.openProject')"
      width="420px"
      destroy-on-close
    >
      <ElForm label-position="top" @submit.prevent="onOpenProjectSubmit">
        <ElFormItem :label="$t('scada.workspace.selectProjectFile')">
          <ElSelect v-model="openProjectName" class="w-full" filterable>
            <ElOption
              v-for="f in projectCatalog"
              :key="f.name"
              :label="`${f.title} (${f.name})`"
              :value="f.name"
            />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="openProjectVisible = false">
          {{ $t('scada.tag.cancel') }}
        </ElButton>
        <ElButton
          type="primary"
          :loading="fileBusy"
          @click="onOpenProjectSubmit"
        >
          {{ $t('scada.workspace.openProject') }}
        </ElButton>
      </template>
    </ElDialog>

    <ElDialog
      v-model="saveAsVisible"
      :title="$t('scada.workspace.saveProjectAs')"
      width="420px"
      destroy-on-close
    >
      <ElForm label-position="top" @submit.prevent="onSaveProjectAsSubmit">
        <ElFormItem :label="$t('scada.workspace.projectName')">
          <ElInput
            v-model="saveAsName"
            :placeholder="$t('scada.workspace.projectNameHint')"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="saveAsVisible = false">
          {{ $t('scada.tag.cancel') }}
        </ElButton>
        <ElButton
          type="primary"
          :loading="fileBusy"
          @click="onSaveProjectAsSubmit"
        >
          {{ $t('scada.workspace.saveProjectAs') }}
        </ElButton>
      </template>
    </ElDialog>

    <ElDialog
      v-model="createChannelVisible"
      :title="$t('scada.workspace.newChannel')"
      width="1100px"
      destroy-on-close
      top="4vh"
    >
      <ChannelForm :show-preview="false" @submit="onChannelSubmit" />
    </ElDialog>

    <ElDialog
      v-model="createDeviceVisible"
      :title="$t('scada.workspace.newDevice')"
      width="1100px"
      destroy-on-close
      top="4vh"
    >
      <DeviceForm
        v-if="treeChannelName"
        :channel="treeChannelName"
        :driver="selectedChannelDriver"
        @submit="onDeviceSubmit"
      />
    </ElDialog>

    <ElDialog
      v-model="createTagVisible"
      :title="$t('scada.workspace.newTag')"
      width="640px"
      destroy-on-close
      top="6vh"
    >
      <TagForm
        v-if="
          (propsChannelName || treeChannelName) &&
          (propsDeviceName || treeDeviceName)
        "
        :channel="propsChannelName || treeChannelName"
        :device="propsDeviceName || treeDeviceName"
        :driver="driverForChannel(propsChannelName || treeChannelName)"
        @submit="onTagSubmit"
        @cancel="createTagVisible = false"
      />
    </ElDialog>

    <DiagnosticsDrawer
      v-model="diagnosticsVisible"
      :device-id="diagnosticsDeviceId"
    />
    <ProjectSettingsDialog v-model="projectSettingsVisible" @saved="refresh" />
  </Page>
</template>
