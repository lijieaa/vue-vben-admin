<script lang="ts" setup>
import type { ScadaAddressHint } from '#/api/scada';

import { computed, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import {
  ElButton,
  ElDialog,
  ElInput,
  ElMessageBox,
  ElScrollbar,
} from 'element-plus';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    hints: ScadaAddressHint[];
    notes?: string;
  }>(),
  {
    notes: '',
  },
);

const emit = defineEmits<{
  'update:modelValue': [open: boolean];
  select: [hint: ScadaAddressHint];
}>();

const filter = ref('');
const selected = ref<null | ScadaAddressHint>(null);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      filter.value = '';
      selected.value = props.hints[0] ?? null;
    }
  },
);

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return props.hints;
  return props.hints.filter(
    (h) =>
      h.text.toLowerCase().includes(q) ||
      h.example.toLowerCase().includes(q) ||
      (h.data_type || '').toLowerCase().includes(q),
  );
});

function close() {
  emit('update:modelValue', false);
}

function confirm() {
  if (!selected.value) return;
  emit('select', selected.value);
  close();
}

async function showHelp() {
  const body = props.notes?.trim() || $t('scada.tag.hintDialog.helpFallback');
  await ElMessageBox.alert(body, $t('scada.tag.hintDialog.helpTitle'), {
    confirmButtonText: $t('scada.tag.hintDialog.ok'),
  });
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    :title="$t('scada.tag.hintDialog.title')"
    width="560px"
    destroy-on-close
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="mb-2">
      <ElInput
        v-model="filter"
        clearable
        :placeholder="$t('scada.tag.hintDialog.filter')"
      />
    </div>
    <div class="flex gap-3">
      <ElScrollbar
        class="h-80 flex-1 rounded border border-[var(--el-border-color)]"
      >
        <button
          v-for="(hint, idx) in filtered"
          :key="`${hint.text}-${idx}`"
          type="button"
          class="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--el-fill-color-light)]"
          :class="
            selected?.text === hint.text
              ? 'bg-[var(--el-color-primary-light-7)] text-[var(--el-color-primary)]'
              : ''
          "
          @click="selected = hint"
          @dblclick="
            selected = hint;
            confirm();
          "
        >
          {{ hint.text }}
        </button>
        <div
          v-if="filtered.length === 0"
          class="text-muted-foreground px-3 py-6 text-center text-sm"
        >
          {{ $t('scada.tag.hintDialog.empty') }}
        </div>
      </ElScrollbar>
      <div class="flex w-24 shrink-0 flex-col gap-2">
        <ElButton type="primary" :disabled="!selected" @click="confirm">
          {{ $t('scada.tag.hintDialog.ok') }}
        </ElButton>
        <ElButton @click="close">
          {{ $t('scada.tag.hintDialog.cancel') }}
        </ElButton>
        <ElButton @click="showHelp">
          {{ $t('scada.tag.hintDialog.help') }}
        </ElButton>
      </div>
    </div>
  </ElDialog>
</template>
