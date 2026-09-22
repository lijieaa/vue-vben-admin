<script lang="ts" setup>
import type { EventLogRecord, EventLogType } from '#/api/scada';

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import { ElButton, ElCheckbox, ElCheckboxGroup, ElMessage } from 'element-plus';

import {
  clearEventLog,
  eventLogStreamURL,
  fetchEventLog,
  scadaErrorMessage,
} from '#/api/scada';

const props = withDefaults(
  defineProps<{
    maxRows?: number;
  }>(),
  { maxRows: 2000 },
);

const records = ref<EventLogRecord[]>([]);
const loading = ref(false);
const autoScroll = ref(true);
const typeFilter = ref<EventLogType[]>([
  'information',
  'security',
  'warning',
  'error',
  'unknown',
]);
const tableRef = ref<HTMLElement | null>(null);
let es: EventSource | null = null;

const visibleRows = computed(() => {
  const allow = new Set(typeFilter.value);
  return records.value.filter((r) => allow.has(r.type || 'unknown'));
});

function typeDotClass(t: EventLogType | string) {
  switch (t) {
    case 'error': {
      return 'bg-red-500';
    }
    case 'warning': {
      return 'bg-amber-500';
    }
    case 'security': {
      return 'bg-violet-500';
    }
    case 'information': {
      return 'bg-sky-500';
    }
    default: {
      return 'bg-muted-foreground/50';
    }
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour12: false });
}

function pushRecord(rec: EventLogRecord) {
  const idx = records.value.findIndex((r) => r.id === rec.id);
  if (idx !== -1) return;
  records.value.push(rec);
  if (records.value.length > props.maxRows) {
    records.value.splice(0, records.value.length - props.maxRows);
  }
  if (autoScroll.value) {
    void nextTick(() => {
      const el = tableRef.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}

async function loadSnapshot() {
  loading.value = true;
  try {
    const res = await fetchEventLog({ limit: props.maxRows });
    records.value = res.records ?? [];
    if (autoScroll.value) {
      void nextTick(() => {
        const el = tableRef.value;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  } catch (error) {
    ElMessage.error(scadaErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function onClear() {
  try {
    await clearEventLog();
    records.value = [];
  } catch (error) {
    ElMessage.error(scadaErrorMessage(error));
  }
}

function connectStream() {
  disconnectStream();
  try {
    es = new EventSource(eventLogStreamURL());
    es.addEventListener('message', (ev) => {
      try {
        const rec = JSON.parse((ev as MessageEvent).data) as EventLogRecord;
        if (rec?.id !== undefined && rec?.id !== null) pushRecord(rec);
      } catch {
        /* ignore malformed */
      }
    });
    es.addEventListener('error', () => {
      /* browser will retry; snapshot refresh on reopen is enough */
    });
  } catch {
    /* SSE unavailable — polling fallback */
  }
}

function disconnectStream() {
  es?.close();
  es = null;
}

onMounted(() => {
  void loadSnapshot().then(connectStream);
});

onUnmounted(() => {
  disconnectStream();
});

watch(autoScroll, (on) => {
  if (on) {
    void nextTick(() => {
      const el = tableRef.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
});
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div
      class="bg-muted/30 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5"
    >
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-sm font-medium">
          {{ $t('scada.workspace.eventLog') }}
        </span>
        <ElCheckboxGroup v-model="typeFilter" class="!flex flex-wrap gap-x-2">
          <ElCheckbox value="information" size="small">
            {{ $t('scada.workspace.eventTypeInfo') }}
          </ElCheckbox>
          <ElCheckbox value="security" size="small">
            {{ $t('scada.workspace.eventTypeSecurity') }}
          </ElCheckbox>
          <ElCheckbox value="warning" size="small">
            {{ $t('scada.workspace.eventTypeWarning') }}
          </ElCheckbox>
          <ElCheckbox value="error" size="small">
            {{ $t('scada.workspace.eventTypeError') }}
          </ElCheckbox>
        </ElCheckboxGroup>
      </div>
      <div class="flex items-center gap-2">
        <ElCheckbox v-model="autoScroll" size="small">
          {{ $t('scada.workspace.eventLogAutoScroll') }}
        </ElCheckbox>
        <ElButton size="small" :loading="loading" @click="loadSnapshot">
          {{ $t('scada.workspace.refresh') }}
        </ElButton>
        <ElButton size="small" @click="onClear">
          {{ $t('scada.workspace.eventLogClear') }}
        </ElButton>
      </div>
    </div>
    <div
      ref="tableRef"
      class="min-h-0 flex-1 overflow-auto"
      v-loading="loading"
    >
      <table class="w-full text-left text-xs">
        <thead class="bg-muted/20 sticky top-0 z-[1]">
          <tr class="opacity-70">
            <th class="w-6 px-2 py-1.5 font-medium"></th>
            <th class="w-[7rem] px-2 py-1.5 font-medium">
              {{ $t('scada.workspace.eventColDate') }}
            </th>
            <th class="w-[7rem] px-2 py-1.5 font-medium">
              {{ $t('scada.workspace.eventColTime') }}
            </th>
            <th class="w-[10rem] px-2 py-1.5 font-medium">
              {{ $t('scada.workspace.eventColSource') }}
            </th>
            <th class="px-2 py-1.5 font-medium">
              {{ $t('scada.workspace.eventColEvent') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in visibleRows"
            :key="row.id"
            class="hover:bg-muted/30 border-t"
          >
            <td class="px-2 py-1">
              <span
                class="inline-block size-2.5 rounded-full"
                :class="typeDotClass(row.type)"
                :title="row.type"
              ></span>
            </td>
            <td class="text-muted-foreground whitespace-nowrap px-2 py-1">
              {{ formatDate(row.time) }}
            </td>
            <td class="text-muted-foreground whitespace-nowrap px-2 py-1">
              {{ formatTime(row.time) }}
            </td>
            <td class="truncate px-2 py-1 font-medium">{{ row.source }}</td>
            <td class="px-2 py-1">{{ row.event }}</td>
          </tr>
          <tr v-if="!visibleRows.length">
            <td
              colspan="5"
              class="text-muted-foreground px-3 py-6 text-center text-sm"
            >
              {{ $t('scada.workspace.eventLogEmpty') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
