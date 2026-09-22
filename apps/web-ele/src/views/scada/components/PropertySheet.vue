<script lang="ts" setup>
import { reactive, watch } from 'vue';

import { ChevronRight } from '@vben/icons';

const props = withDefaults(
  defineProps<{
    groups: Array<{ key: string; label: string }>;
    /** Group keys that start collapsed (default: all expanded). */
    defaultCollapsed?: string[];
  }>(),
  {
    defaultCollapsed: () => [],
  },
);

const collapsedKeys = reactive(new Set<string>());
const trackedKeys = reactive(new Set<string>());

watch(
  () => props.groups.map((g) => g.key).join('\0'),
  () => {
    const next = new Set(props.groups.map((g) => g.key));
    for (const key of [...collapsedKeys]) {
      if (!next.has(key)) collapsedKeys.delete(key);
    }
    for (const key of [...trackedKeys]) {
      if (!next.has(key)) trackedKeys.delete(key);
    }
    for (const g of props.groups) {
      if (trackedKeys.has(g.key)) continue;
      trackedKeys.add(g.key);
      if (props.defaultCollapsed.includes(g.key)) {
        collapsedKeys.add(g.key);
      }
    }
  },
  { immediate: true },
);

function isCollapsed(key: string) {
  return collapsedKeys.has(key);
}

function toggle(key: string) {
  if (collapsedKeys.has(key)) collapsedKeys.delete(key);
  else collapsedKeys.add(key);
}
</script>

<template>
  <!-- Godot Inspector: vertical foldout groups, fields fill dock width. -->
  <div class="property-inspector w-full min-w-0">
    <section
      v-for="g in groups"
      :key="g.key"
      class="border-border/60 border-b last:border-b-0"
    >
      <button
        type="button"
        class="bg-muted/40 hover:bg-muted/60 text-foreground flex w-full items-center gap-1 px-1.5 py-1 text-left text-xs font-semibold tracking-wide select-none"
        @click="toggle(g.key)"
      >
        <ChevronRight
          class="text-muted-foreground size-3.5 shrink-0 transition-transform"
          :class="isCollapsed(g.key) ? undefined : 'rotate-90'"
        />
        <span class="truncate">{{ g.label }}</span>
      </button>
      <div
        v-show="!isCollapsed(g.key)"
        class="property-inspector-body px-1.5 py-1.5"
      >
        <slot :name="g.key"></slot>
      </div>
    </section>
  </div>
</template>

<style scoped>
.property-inspector-body {
  font-size: 12px;
}

.property-inspector-body :deep(.el-form-item) {
  margin-bottom: 6px;
}

.property-inspector-body :deep(.el-form-item__label) {
  height: 28px;
  padding: 0 8px 0 0;
  font-size: 12px;
  line-height: 28px;
}

.property-inspector-body :deep(.el-form-item__content) {
  min-height: 28px;
  font-size: 12px;
  line-height: 28px;
}

.property-inspector-body :deep(.el-input__wrapper),
.property-inspector-body :deep(.el-select__wrapper),
.property-inspector-body :deep(.el-textarea__inner) {
  min-height: 28px;
  font-size: 12px;
}

.property-inspector-body :deep(.el-input__inner),
.property-inspector-body :deep(.el-select__selected-item),
.property-inspector-body :deep(.el-select__placeholder),
.property-inspector-body :deep(.el-input-number__decrease),
.property-inspector-body :deep(.el-input-number__increase) {
  font-size: 12px;
}

.property-inspector-body :deep(.el-input-number) {
  width: 100%;
}

.property-inspector-body :deep(.el-switch__label) {
  font-size: 12px;
}

.property-inspector-body :deep(.el-button) {
  --el-font-size-base: 12px;

  font-size: 12px;
}
</style>
