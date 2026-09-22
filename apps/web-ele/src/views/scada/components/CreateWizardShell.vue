<script lang="ts" setup>
import { computed } from 'vue';

import { $t } from '@vben/locales';

import { ElButton, ElCard } from 'element-plus';

const props = withDefaults(
  defineProps<{
    title: string;
    steps: Array<{ key: string; title: string }>;
    stepIndex: number;
    submitting?: boolean;
    showPreview?: boolean;
    loading?: boolean;
    editMode?: boolean;
    /** Dock inspector: no card chrome / preview column. */
    bare?: boolean;
  }>(),
  {
    submitting: false,
    showPreview: true,
    loading: false,
    editMode: false,
    bare: false,
  },
);

const emit = defineEmits<{
  prev: [];
  next: [];
  reset: [];
}>();

const isFirst = computed(() => props.stepIndex <= 0);
const isLast = computed(
  () => props.stepIndex >= Math.max(0, props.steps.length - 1),
);
const currentTitle = computed(
  () => props.steps[props.stepIndex]?.title ?? props.title,
);
</script>

<template>
  <div
    class="flex flex-col gap-4"
    :class="bare ? undefined : 'lg:flex-row'"
    v-loading="loading"
  >
    <!-- Dock inspector: plain column, sticky Save -->
    <div v-if="bare" class="min-w-0 flex-1">
      <slot></slot>
      <div
        class="sticky bottom-0 mt-3 flex justify-end gap-2 bg-background/95 py-2 backdrop-blur"
      >
        <ElButton
          type="primary"
          size="small"
          :loading="submitting"
          @click="emit('next')"
        >
          {{ $t('scada.channel.save') }}
        </ElButton>
      </div>
    </div>

    <!-- Create / non-embed edit: card wizard -->
    <template v-else>
      <ElCard class="min-w-0 flex-1" shadow="never">
        <template #header>
          <span class="font-medium">{{ title }}</span>
        </template>

        <div
          v-if="!editMode"
          class="mb-4 flex items-end justify-between border-b pb-3"
        >
          <div>
            <div class="text-lg font-medium">{{ currentTitle }}</div>
            <div class="text-muted-foreground text-xs">
              {{ stepIndex + 1 }} / {{ steps.length }}
            </div>
          </div>
        </div>

        <slot></slot>

        <div class="mt-6 flex justify-between gap-2">
          <ElButton v-if="!editMode" @click="emit('reset')">
            {{ $t('scada.channel.reset') }}
          </ElButton>
          <div class="ml-auto flex gap-2">
            <ElButton
              v-if="!editMode"
              :disabled="isFirst"
              @click="emit('prev')"
            >
              {{ $t('scada.channel.prev') }}
            </ElButton>
            <ElButton
              type="primary"
              :loading="submitting"
              @click="emit('next')"
            >
              {{
                editMode
                  ? $t('scada.channel.save')
                  : isLast
                    ? $t('scada.channel.create')
                    : $t('scada.channel.next')
              }}
            </ElButton>
          </div>
        </div>
      </ElCard>

      <ElCard
        v-if="showPreview"
        class="w-full shrink-0 lg:w-[380px]"
        shadow="never"
      >
        <template #header>
          <span class="font-medium">{{ $t('scada.channel.preview') }}</span>
        </template>
        <slot name="preview"></slot>
      </ElCard>
    </template>
  </div>
</template>
