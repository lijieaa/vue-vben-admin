<script lang="ts" setup>
import type {
  AlarmArea,
  AlarmCondition,
  AlarmEvent,
  AlarmsConfig,
  AlarmSource,
  AlarmStateRow,
  AlarmSubCondition,
} from '#/api/scada';

import { computed, onMounted, onUnmounted, ref } from 'vue';

import { $t } from '@vben/locales';

import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTree,
} from 'element-plus';

import {
  ackAlarm,
  getAlarmEvents,
  getAlarms,
  getAlarmState,
  putAlarms,
  scadaErrorMessage,
} from '#/api/scada';

type TreeKind = 'area' | 'condition' | 'root' | 'source';

type TreeNode = {
  children?: TreeNode[];
  kind: TreeKind;
  label: string;
  path: string; // area / area.source / area.source.condition
};

const config = ref<AlarmsConfig>({ areas: [] });
const loading = ref(false);
const saving = ref(false);
const selectedPath = ref('');
const selectedKind = ref<TreeKind>('root');
const states = ref<AlarmStateRow[]>([]);
const events = ref<AlarmEvent[]>([]);
let pollTimer: null | ReturnType<typeof setInterval> = null;

const treeData = computed<TreeNode[]>(() => {
  return (config.value.areas || []).map((area) => ({
    kind: 'area' as const,
    label: area.name || '(area)',
    path: area.name,
    children: (area.sources || []).map((src) => ({
      kind: 'source' as const,
      label: src.name || '(source)',
      path: `${area.name}/${src.name}`,
      children: (src.conditions || []).map((cond) => ({
        kind: 'condition' as const,
        label: cond.name || '(condition)',
        path: `${area.name}/${src.name}/${cond.name}`,
      })),
    })),
  }));
});

const selectedArea = computed(() => {
  const [a] = selectedPath.value.split('/');
  return (config.value.areas || []).find((x) => x.name === a) || null;
});

const selectedSource = computed(() => {
  const parts = selectedPath.value.split('/');
  if (parts.length < 2 || !selectedArea.value) return null;
  return (
    (selectedArea.value.sources || []).find((x) => x.name === parts[1]) || null
  );
});

const selectedCondition = computed(() => {
  const parts = selectedPath.value.split('/');
  if (parts.length < 3 || !selectedSource.value) return null;
  return (
    (selectedSource.value.conditions || []).find((x) => x.name === parts[2]) ||
    null
  );
});

function onTreeClick(data: TreeNode) {
  selectedPath.value = data.path;
  selectedKind.value = data.kind;
}

async function loadConfig() {
  loading.value = true;
  try {
    const body = await getAlarms();
    config.value = {
      areas: body?.areas ? structuredClone(body.areas) : [],
    };
  } catch (error) {
    ElMessage.error(
      `${$t('scada.alarms.loadFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    loading.value = false;
  }
}

async function saveConfig() {
  saving.value = true;
  try {
    const body = await putAlarms(config.value);
    config.value = {
      areas: body?.areas ? structuredClone(body.areas) : config.value.areas,
    };
    ElMessage.success($t('scada.alarms.saved'));
  } catch (error) {
    ElMessage.error(
      `${$t('scada.alarms.saveFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    saving.value = false;
  }
}

async function pollLive() {
  try {
    const [st, ev] = await Promise.all([getAlarmState(), getAlarmEvents()]);
    states.value = st?.states || [];
    events.value = [...(ev?.events || [])].toReversed().slice(0, 50);
  } catch {
    // ignore poll errors
  }
}

function addArea() {
  const name = `Area${(config.value.areas?.length || 0) + 1}`;
  const area: AlarmArea = { name, sources: [] };
  config.value.areas = [...(config.value.areas || []), area];
  selectedPath.value = name;
  selectedKind.value = 'area';
}

function addSource() {
  const area = selectedArea.value;
  if (!area) {
    ElMessage.warning($t('scada.alarms.selectNode'));
    return;
  }
  const name = `Src${(area.sources?.length || 0) + 1}`;
  const src: AlarmSource = { name, tag: '', conditions: [] };
  area.sources = [...(area.sources || []), src];
  selectedPath.value = `${area.name}/${name}`;
  selectedKind.value = 'source';
}

function addCondition() {
  const area = selectedArea.value;
  const src = selectedSource.value;
  if (!area || !src) {
    ElMessage.warning($t('scada.alarms.selectNode'));
    return;
  }
  const name = `Cond${(src.conditions?.length || 0) + 1}`;
  const cond: AlarmCondition = {
    name,
    enabled: true,
    subconditions: [
      {
        name: 'Hi',
        type: 'value',
        op: '>=',
        threshold: 0,
        severity: 500,
        message: '',
        ack_required: false,
      },
    ],
  };
  src.conditions = [...(src.conditions || []), cond];
  selectedPath.value = `${area.name}/${src.name}/${name}`;
  selectedKind.value = 'condition';
}

function addSub() {
  const cond = selectedCondition.value;
  if (!cond) return;
  const sub: AlarmSubCondition = {
    name: `Sub${(cond.subconditions?.length || 0) + 1}`,
    type: 'value',
    op: '>=',
    threshold: 0,
    severity: 500,
    message: '',
  };
  cond.subconditions = [...(cond.subconditions || []), sub];
}

function removeSelected() {
  const parts = selectedPath.value.split('/');
  if (selectedKind.value === 'area' && parts[0]) {
    config.value.areas = (config.value.areas || []).filter(
      (a) => a.name !== parts[0],
    );
  } else if (
    selectedKind.value === 'source' &&
    selectedArea.value &&
    parts[1]
  ) {
    selectedArea.value.sources = (selectedArea.value.sources || []).filter(
      (s) => s.name !== parts[1],
    );
  } else if (
    selectedKind.value === 'condition' &&
    selectedSource.value &&
    parts[2]
  ) {
    selectedSource.value.conditions = (
      selectedSource.value.conditions || []
    ).filter((c) => c.name !== parts[2]);
  }
  selectedPath.value = '';
  selectedKind.value = 'root';
}

async function doAck(row: AlarmStateRow) {
  try {
    await ackAlarm({
      source: row.source,
      condition: row.condition,
      cookie: row.cookie,
      ack_id: 'ui',
    });
    ElMessage.success($t('scada.alarms.ackOk'));
    await pollLive();
  } catch (error) {
    ElMessage.error(
      `${$t('scada.alarms.ackFailed')}: ${scadaErrorMessage(error)}`,
    );
  }
}

function canAck(row: unknown) {
  const r = row as AlarmStateRow;
  return Boolean(r?.active && !r?.acked);
}

function onAckClick(row: unknown) {
  void doAck(row as AlarmStateRow);
}

onMounted(async () => {
  await loadConfig();
  await pollLive();
  pollTimer = setInterval(pollLive, 2000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">{{ $t('scada.alarms.title') }}</h1>
      <span class="text-muted-foreground text-sm">{{
        $t('scada.alarms.desc')
      }}</span>
      <div class="ml-auto flex gap-2">
        <ElButton :loading="loading" @click="loadConfig">
          {{ $t('scada.alarms.refresh') }}
        </ElButton>
        <ElButton type="primary" :loading="saving" @click="saveConfig">
          {{ $t('scada.alarms.save') }}
        </ElButton>
      </div>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-12 gap-3">
      <div
        class="border-border col-span-3 flex flex-col gap-2 rounded border p-2"
      >
        <div class="flex flex-wrap gap-1">
          <ElButton size="small" @click="addArea">
            {{ $t('scada.alarms.addArea') }}
          </ElButton>
          <ElButton size="small" @click="addSource">
            {{ $t('scada.alarms.addSource') }}
          </ElButton>
          <ElButton size="small" @click="addCondition">
            {{ $t('scada.alarms.addCondition') }}
          </ElButton>
          <ElButton size="small" type="danger" @click="removeSelected">
            {{ $t('scada.alarms.delete') }}
          </ElButton>
        </div>
        <ElTree
          :data="treeData"
          node-key="path"
          default-expand-all
          highlight-current
          :props="{ label: 'label', children: 'children' }"
          @node-click="onTreeClick"
        />
        <div v-if="!treeData.length" class="text-muted-foreground p-2 text-sm">
          {{ $t('scada.alarms.emptyTree') }}
        </div>
      </div>

      <div class="border-border col-span-5 overflow-auto rounded border p-3">
        <template v-if="selectedKind === 'area' && selectedArea">
          <ElForm label-width="120px">
            <ElFormItem :label="$t('scada.alarms.areaName')">
              <ElInput v-model="selectedArea.name" />
            </ElFormItem>
          </ElForm>
        </template>
        <template v-else-if="selectedKind === 'source' && selectedSource">
          <ElForm label-width="120px">
            <ElFormItem :label="$t('scada.alarms.sourceName')">
              <ElInput v-model="selectedSource.name" />
            </ElFormItem>
            <ElFormItem :label="$t('scada.alarms.tag')">
              <ElInput v-model="selectedSource.tag" placeholder="Ch.Dev.Tag" />
            </ElFormItem>
          </ElForm>
        </template>
        <template v-else-if="selectedKind === 'condition' && selectedCondition">
          <ElForm label-width="120px">
            <ElFormItem :label="$t('scada.alarms.conditionName')">
              <ElInput v-model="selectedCondition.name" />
            </ElFormItem>
            <ElFormItem :label="$t('scada.alarms.enabled')">
              <ElSwitch v-model="selectedCondition.enabled" />
            </ElFormItem>
          </ElForm>
          <div class="mb-2 flex items-center gap-2">
            <span class="font-medium">Subconditions</span>
            <ElButton size="small" @click="addSub">
              {{ $t('scada.alarms.addSub') }}
            </ElButton>
          </div>
          <div
            v-for="(sub, idx) in selectedCondition.subconditions"
            :key="idx"
            class="border-border mb-3 rounded border p-2"
          >
            <ElForm label-width="120px" size="small">
              <ElFormItem :label="$t('scada.alarms.subName')">
                <ElInput v-model="sub.name" />
              </ElFormItem>
              <ElFormItem :label="$t('scada.alarms.type')">
                <ElSelect v-model="sub.type" class="w-full">
                  <ElOption
                    value="value"
                    :label="$t('scada.alarms.typeValue')"
                  />
                  <ElOption
                    value="deviation"
                    :label="$t('scada.alarms.typeDeviation')"
                  />
                  <ElOption value="roc" :label="$t('scada.alarms.typeRoc')" />
                </ElSelect>
              </ElFormItem>
              <ElFormItem :label="$t('scada.alarms.op')">
                <ElSelect v-model="sub.op" class="w-full">
                  <ElOption
                    v-for="op in ['>', '>=', '<', '<=', '==', '!=']"
                    :key="op"
                    :value="op"
                    :label="op"
                  />
                </ElSelect>
              </ElFormItem>
              <ElFormItem
                v-if="sub.type === 'value'"
                :label="$t('scada.alarms.threshold')"
              >
                <ElInputNumber v-model="sub.threshold" class="w-full" />
              </ElFormItem>
              <template v-if="sub.type === 'deviation'">
                <ElFormItem :label="$t('scada.alarms.setpoint')">
                  <ElInputNumber v-model="sub.setpoint" class="w-full" />
                </ElFormItem>
                <ElFormItem :label="$t('scada.alarms.setpointTag')">
                  <ElInput v-model="sub.setpoint_tag" />
                </ElFormItem>
                <ElFormItem :label="$t('scada.alarms.deadband')">
                  <ElInputNumber v-model="sub.deadband" class="w-full" />
                </ElFormItem>
              </template>
              <template v-if="sub.type === 'roc'">
                <ElFormItem :label="$t('scada.alarms.rate')">
                  <ElInputNumber v-model="sub.rate" class="w-full" />
                </ElFormItem>
                <ElFormItem :label="$t('scada.alarms.windowMs')">
                  <ElInputNumber v-model="sub.window_ms" class="w-full" />
                </ElFormItem>
              </template>
              <ElFormItem :label="$t('scada.alarms.severity')">
                <ElInputNumber v-model="sub.severity" class="w-full" />
              </ElFormItem>
              <ElFormItem :label="$t('scada.alarms.message')">
                <ElInput v-model="sub.message" />
              </ElFormItem>
              <ElFormItem :label="$t('scada.alarms.ackRequired')">
                <ElSwitch v-model="sub.ack_required" />
              </ElFormItem>
            </ElForm>
          </div>
        </template>
        <div v-else class="text-muted-foreground text-sm">
          {{ $t('scada.alarms.selectNode') }}
        </div>
      </div>

      <div
        class="border-border col-span-4 flex min-h-0 flex-col gap-2 overflow-auto rounded border p-2"
      >
        <div class="font-medium">{{ $t('scada.alarms.live') }}</div>
        <ElTable :data="states" size="small" height="220">
          <ElTableColumn prop="source" label="source" min-width="100" />
          <ElTableColumn prop="device" label="device" width="70" />
          <ElTableColumn prop="active" label="active" width="60" />
          <ElTableColumn prop="severity" label="sev" width="50" />
          <ElTableColumn label="" width="70">
            <template #default="{ row }">
              <ElButton
                v-if="canAck(row)"
                size="small"
                @click="onAckClick(row)"
              >
                {{ $t('scada.alarms.ack') }}
              </ElButton>
            </template>
          </ElTableColumn>
        </ElTable>
        <div class="font-medium">{{ $t('scada.alarms.events') }}</div>
        <ElTable :data="events" size="small" height="220">
          <ElTableColumn prop="time" label="time" min-width="90" />
          <ElTableColumn prop="source" label="source" min-width="90" />
          <ElTableColumn prop="active" label="active" width="60" />
          <ElTableColumn prop="message" label="msg" min-width="80" />
        </ElTable>
      </div>
    </div>
  </div>
</template>
