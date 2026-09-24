<script lang="ts" setup>
import { reactive, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
} from 'element-plus';

import { fetchProject, patchProject, scadaErrorMessage } from '#/api/scada';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [open: boolean];
  saved: [];
}>();

const loading = ref(false);
const submitting = ref(false);
const form = reactive({
  title: '',
  virtualNetworkMode: 'load_balanced',
  mqttSlug: '',
  mqttVtqByDevice: false,
});

const modeOptions = [
  { value: 'load_balanced', labelKey: 'scada.options.load_balanced' },
  { value: 'priority', labelKey: 'scada.options.priority' },
];

async function load() {
  loading.value = true;
  try {
    const p = await fetchProject();
    form.title = p.title || '';
    form.virtualNetworkMode = p.virtual_network_mode || 'load_balanced';
    form.mqttSlug = p.mqtt_slug || '';
    form.mqttVtqByDevice = !!p.mqtt_vtq_by_device;
  } catch (error) {
    ElMessage.error(
      `${$t('scada.project.loadFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void load();
  },
);

async function onSave() {
  submitting.value = true;
  try {
    await patchProject({
      title: form.title.trim(),
      virtual_network_mode: form.virtualNetworkMode,
      mqtt_slug: form.mqttSlug.trim(),
      mqtt_vtq_by_device: form.mqttVtqByDevice,
    });
    ElMessage.success($t('scada.project.saved'));
    emit('update:modelValue', false);
    emit('saved');
  } catch (error) {
    ElMessage.error(
      `${$t('scada.project.saveFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    :title="$t('scada.project.settings')"
    width="480px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElForm v-loading="loading" label-position="left" label-width="160px">
      <ElFormItem :label="$t('scada.project.fields.title')">
        <ElInput v-model="form.title" maxlength="256" />
      </ElFormItem>
      <ElFormItem :label="$t('scada.project.fields.virtualNetworkMode')">
        <ElSelect v-model="form.virtualNetworkMode" class="w-full">
          <ElOption
            v-for="o in modeOptions"
            :key="o.value"
            :label="$t(o.labelKey)"
            :value="o.value"
          />
        </ElSelect>
      </ElFormItem>
      <p class="text-muted-foreground text-xs">
        {{ $t('scada.project.hints.virtualNetworkMode') }}
      </p>
      <ElFormItem :label="$t('scada.project.fields.mqttSlug')">
        <ElInput
          v-model="form.mqttSlug"
          maxlength="64"
          placeholder="saltspray"
        />
      </ElFormItem>
      <p class="text-muted-foreground text-xs">
        {{ $t('scada.project.hints.mqttSlug') }}
      </p>
      <ElFormItem :label="$t('scada.project.fields.mqttVtqByDevice')">
        <ElSwitch v-model="form.mqttVtqByDevice" />
      </ElFormItem>
      <p class="text-muted-foreground text-xs">
        {{ $t('scada.project.hints.mqttVtqByDevice') }}
      </p>
    </ElForm>
    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">
        {{ $t('scada.tag.cancel') }}
      </ElButton>
      <ElButton type="primary" :loading="submitting" @click="onSave">
        {{ $t('scada.device.save') }}
      </ElButton>
    </template>
  </ElDialog>
</template>
