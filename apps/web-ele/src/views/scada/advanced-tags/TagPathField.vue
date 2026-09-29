<script lang="ts" setup>
import type { ScadaLiveTag } from '#/api/scada';

import { onMounted, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import {
  ElButton,
  ElDialog,
  ElInput,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
} from 'element-plus';

import { fetchLiveTags, scadaErrorMessage } from '#/api/scada';

const props = withDefaults(
  defineProps<{
    placeholder?: string;
  }>(),
  { placeholder: '' },
);

const model = defineModel<string>({ default: '' });

const browseOpen = ref(false);
const loading = ref(false);
const tags = ref<ScadaLiveTag[]>([]);
const filter = ref('');
const selectedPath = ref('');
const loadError = ref('');

async function loadTags() {
  loading.value = true;
  loadError.value = '';
  try {
    tags.value = (await fetchLiveTags()) || [];
  } catch (error) {
    tags.value = [];
    loadError.value = scadaErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function openBrowse() {
  selectedPath.value = model.value || '';
  filter.value = '';
  browseOpen.value = true;
  void loadTags();
}

function confirmBrowse() {
  if (selectedPath.value) {
    model.value = selectedPath.value;
  }
  browseOpen.value = false;
}

function onRowClick(row: ScadaLiveTag) {
  selectedPath.value = row.path;
}

const filtered = ref<ScadaLiveTag[]>([]);

watch(
  [tags, filter],
  () => {
    const q = filter.value.trim().toLowerCase();
    filtered.value = q
      ? tags.value.filter((t) => t.path.toLowerCase().includes(q))
      : tags.value;
  },
  { immediate: true },
);

onMounted(() => {
  /* lazy load on browse */
});
</script>

<template>
  <div class="flex w-full min-w-0 gap-1">
    <ElInput
      v-model="model"
      class="min-w-0 flex-1"
      :placeholder="props.placeholder || $t('scada.advancedTags.tagPathHint')"
      clearable
    />
    <ElButton class="shrink-0" @click="openBrowse">
      {{ $t('scada.advancedTags.browse') }}
    </ElButton>

    <ElDialog
      v-model="browseOpen"
      :title="$t('scada.advancedTags.browseTitle')"
      width="560px"
      append-to-body
      destroy-on-close
    >
      <div class="mb-2 flex gap-2">
        <ElInput
          v-model="filter"
          clearable
          :placeholder="$t('scada.advancedTags.filterTags')"
        />
        <ElButton :loading="loading" @click="loadTags">
          {{ $t('scada.advancedTags.refresh') }}
        </ElButton>
      </div>
      <p v-if="loadError" class="mb-2 text-xs text-red-500">{{ loadError }}</p>
      <ElTable
        v-loading="loading"
        :data="filtered"
        height="320"
        highlight-current-row
        size="small"
        @row-click="onRowClick"
        @row-dblclick="
          (row: ScadaLiveTag) => {
            selectedPath = row.path;
            confirmBrowse();
          }
        "
      >
        <ElTableColumn
          prop="path"
          :label="$t('scada.advancedTags.tagPath')"
          min-width="240"
        />
        <ElTableColumn
          prop="value"
          :label="$t('scada.advancedTags.liveValue')"
          width="120"
        >
          <template #default="{ row }">
            {{ row.value ?? '-' }}
          </template>
        </ElTableColumn>
      </ElTable>
      <div class="mt-3">
        <ElSelect
          v-model="selectedPath"
          filterable
          allow-create
          default-first-option
          class="w-full"
          :placeholder="$t('scada.advancedTags.tagPathHint')"
        >
          <ElOption
            v-for="t in filtered.slice(0, 200)"
            :key="t.path"
            :label="t.path"
            :value="t.path"
          />
        </ElSelect>
      </div>
      <template #footer>
        <ElButton @click="browseOpen = false">
          {{ $t('scada.advancedTags.cancel') }}
        </ElButton>
        <ElButton
          type="primary"
          :disabled="!selectedPath"
          @click="confirmBrowse"
        >
          {{ $t('scada.advancedTags.ok') }}
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>
