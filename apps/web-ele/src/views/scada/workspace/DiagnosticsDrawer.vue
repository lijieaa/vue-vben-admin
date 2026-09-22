<script lang="ts" setup>
import type { ScadaDeviceSnapshot, ScadaRuntimeSnapshot } from '#/api/scada';

import { onMounted, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import {
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElDrawer,
  ElMessage,
} from 'element-plus';

import {
  fetchDiagnosticsDevice,
  fetchDiagnosticsRuntime,
  scadaErrorMessage,
} from '#/api/scada';

const props = defineProps<{
  modelValue: boolean;
  /** Device id for optional detail row when a device is selected. */
  deviceId?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [open: boolean];
}>();

const loading = ref(false);
const runtime = ref<null | ScadaRuntimeSnapshot>(null);
const deviceSnap = ref<null | ScadaDeviceSnapshot>(null);

async function refresh() {
  loading.value = true;
  try {
    runtime.value = await fetchDiagnosticsRuntime();
    if (props.deviceId) {
      try {
        deviceSnap.value = await fetchDiagnosticsDevice(props.deviceId);
      } catch {
        deviceSnap.value = null;
      }
    } else {
      deviceSnap.value = null;
    }
  } catch (error) {
    runtime.value = null;
    ElMessage.error(
      `${$t('scada.diagnostics.loadFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void refresh();
  },
);

onMounted(() => {
  if (props.modelValue) void refresh();
});
</script>

<template>
  <ElDrawer
    :model-value="modelValue"
    :title="$t('scada.diagnostics.title')"
    size="420px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-loading="loading" class="space-y-4">
      <div class="flex justify-end">
        <ElButton size="small" @click="refresh">
          {{ $t('scada.workspace.refresh') }}
        </ElButton>
      </div>

      <template v-if="runtime">
        <div class="text-sm font-medium">
          {{ $t('scada.diagnostics.runtime') }}
        </div>
        <ElDescriptions :column="1" border size="small">
          <ElDescriptionsItem :label="$t('scada.diagnostics.devices')">
            {{ runtime.devices }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.diagnostics.online')">
            {{ runtime.online }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.diagnostics.uptime')">
            {{ Math.round(runtime.uptime_sec) }}s
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.diagnostics.reads')">
            {{ runtime.reads_total }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.diagnostics.writes')">
            {{ runtime.writes_total }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.diagnostics.errors')">
            {{ runtime.errors_total }}
          </ElDescriptionsItem>
        </ElDescriptions>
      </template>

      <template v-if="deviceSnap">
        <div class="mt-4 text-sm font-medium">
          {{ $t('scada.diagnostics.device') }} · {{ deviceSnap.name }}
        </div>
        <ElDescriptions :column="1" border size="small">
          <ElDescriptionsItem :label="$t('scada.diagnostics.status')">
            {{ deviceSnap.status || '-' }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.diagnostics.driver')">
            {{ deviceSnap.driver || '-' }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.diagnostics.endpoint')">
            {{ deviceSnap.endpoint || '-' }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.diagnostics.error')">
            {{ deviceSnap.error || '-' }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.diagnostics.reads')">
            {{ deviceSnap.reads_total ?? 0 }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.diagnostics.writes')">
            {{ deviceSnap.writes_total ?? 0 }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.diagnostics.errors')">
            {{ deviceSnap.errors_total ?? 0 }}
          </ElDescriptionsItem>
        </ElDescriptions>
      </template>
    </div>
  </ElDrawer>
</template>
