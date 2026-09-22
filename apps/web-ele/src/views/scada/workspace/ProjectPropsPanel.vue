<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';

import { $t } from '@vben/locales';

import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
} from 'element-plus';

import { fetchProject, patchProject, scadaErrorMessage } from '#/api/scada';

import PropertySheet from '../components/PropertySheet.vue';

const emit = defineEmits<{
  saved: [];
}>();

const loading = ref(false);
const submitting = ref(false);
const form = reactive({
  title: '',
  file: '',
  virtualNetworkMode: 'load_balanced',
});

const groups = [{ key: 'general', labelKey: 'scada.channel.groups.general' }];

const modeOptions = [
  { value: 'load_balanced', labelKey: 'scada.options.load_balanced' },
  { value: 'priority', labelKey: 'scada.options.priority' },
];

async function load() {
  loading.value = true;
  try {
    const p = await fetchProject();
    form.title = p.title || '';
    form.file = p.file || '';
    form.virtualNetworkMode = p.virtual_network_mode || 'load_balanced';
  } catch (error) {
    ElMessage.error(
      `${$t('scada.project.loadFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  submitting.value = true;
  try {
    await patchProject({
      title: form.title.trim(),
      virtual_network_mode: form.virtualNetworkMode,
    });
    ElMessage.success($t('scada.project.saved'));
    emit('saved');
  } catch (error) {
    ElMessage.error(
      `${$t('scada.project.saveFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void load();
});

defineExpose({ load });
</script>

<template>
  <div v-loading="loading" class="flex flex-col gap-3">
    <ElForm label-position="left" label-width="120px">
      <PropertySheet
        :groups="groups.map((g) => ({ key: g.key, label: $t(g.labelKey) }))"
      >
        <template #general>
          <ElFormItem :label="$t('scada.workspace.projectFile')">
            <ElInput :model-value="form.file" disabled />
          </ElFormItem>
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
        </template>
      </PropertySheet>
    </ElForm>
    <div
      class="sticky bottom-0 flex justify-end bg-background/95 py-2 backdrop-blur"
    >
      <ElButton
        type="primary"
        size="small"
        :loading="submitting"
        @click="onSave"
      >
        {{ $t('scada.device.save') }}
      </ElButton>
    </div>
  </div>
</template>
