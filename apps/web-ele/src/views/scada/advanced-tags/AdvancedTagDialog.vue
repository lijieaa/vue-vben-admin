<script lang="ts" setup>
import type {
  AdvancedElement,
  AdvancedKind,
  AdvancedTagDef,
  AdvancedTrigger,
} from '#/api/scada';

import { computed, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import {
  ElButton,
  ElDialog,
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
} from 'element-plus';

import {
  emptyTrigger,
  newTagDef,
  scadaErrorMessage,
  validateAdvancedExpression,
} from '#/api/scada';

import TagPathField from './TagPathField.vue';

const props = defineProps<{
  kind: AdvancedKind;
  /** null = create */
  initial: AdvancedTagDef | null;
  defaultName?: string;
}>();

const emit = defineEmits<{
  confirm: [tag: AdvancedTagDef];
}>();

const open = defineModel<boolean>('open', { default: false });

const draft = ref<AdvancedTagDef | null>(null);
const validating = ref(false);
const elementEditIndex = ref(-1);
const elementDraft = ref<AdvancedElement | null>(null);
const elementDlgOpen = ref(false);

const title = computed(() => {
  const k = $t(`scada.advancedTags.kinds.${props.kind}`);
  return props.initial
    ? $t('scada.advancedTags.editKind', { kind: k })
    : $t('scada.advancedTags.newKind', { kind: k });
});

const exprSnippets = [
  { label: 'TAG()', insert: 'TAG("")' },
  { label: 'QUALITY()', insert: 'QUALITY("")' },
  { label: 'ABS()', insert: 'ABS()' },
  { label: 'SQRT()', insert: 'SQRT()' },
  { label: 'IF()', insert: 'IF(,,)' },
  { label: '+', insert: ' + ' },
  { label: '-', insert: ' - ' },
  { label: '*', insert: ' * ' },
  { label: '/', insert: ' / ' },
];

function cloneTag(t: AdvancedTagDef): AdvancedTagDef {
  return structuredClone(t);
}

function ensureTrigger(t?: AdvancedTrigger | null): AdvancedTrigger {
  if (!t) return emptyTrigger();
  return {
    mode: t.mode || 'by_rate',
    rate: t.rate ?? 1,
    rate_unit: t.rate_unit || 'seconds',
    trigger_tag: t.trigger_tag || '',
    complete_tag: t.complete_tag || '',
  };
}

watch(
  () => [open.value, props.initial, props.kind, props.defaultName] as const,
  ([isOpen]) => {
    if (!isOpen) return;
    if (props.initial) {
      const c = cloneTag(props.initial);
      if (c.kind === 'complex') {
        c.send_trigger = ensureTrigger(c.send_trigger);
        c.elements = (c.elements || []).map((e) => ({
          ...e,
          insert_trigger: e.insert_trigger
            ? ensureTrigger(e.insert_trigger)
            : undefined,
        }));
      }
      if (c.kind === 'derived') {
        c.trigger = ensureTrigger(c.trigger);
      }
      draft.value = c;
    } else {
      draft.value = newTagDef(
        props.kind,
        props.defaultName || `${props.kind}_tag`,
      );
    }
  },
);

function onTriggerMode(trig: AdvancedTrigger, mode: AdvancedTrigger['mode']) {
  trig.mode = mode;
  if (mode === 'by_rate') {
    if (!trig.rate) trig.rate = 1;
    if (!trig.rate_unit) trig.rate_unit = 'seconds';
  }
}

function insertSnippet(text: string) {
  if (!draft.value) return;
  draft.value.expression = (draft.value.expression || '') + text;
}

async function checkExpression() {
  if (!draft.value?.expression?.trim()) {
    ElMessage.warning($t('scada.advancedTags.expressionRequired'));
    return;
  }
  validating.value = true;
  try {
    const r = await validateAdvancedExpression(draft.value.expression);
    if (r.ok) {
      ElMessage.success(
        r.eval_note
          ? `${$t('scada.advancedTags.validateOk')}: ${r.eval_note}`
          : $t('scada.advancedTags.validateOk'),
      );
    } else {
      ElMessage.error(r.error || $t('scada.advancedTags.validateFailed'));
    }
  } catch (error) {
    ElMessage.error(scadaErrorMessage(error));
  } finally {
    validating.value = false;
  }
}

function openAddElement() {
  elementEditIndex.value = -1;
  elementDraft.value = {
    name: `E${(draft.value?.elements?.length || 0) + 1}`,
    tag: '',
    insert_trigger: emptyTrigger('by_rate'),
  };
  elementDlgOpen.value = true;
}

function openEditElement(idx: number) {
  const el = draft.value?.elements?.[idx];
  if (!el) return;
  elementEditIndex.value = idx;
  elementDraft.value = {
    name: el.name,
    tag: el.tag,
    insert_trigger: el.insert_trigger
      ? ensureTrigger(el.insert_trigger)
      : emptyTrigger('by_rate'),
  };
  elementDlgOpen.value = true;
}

function confirmElement() {
  if (!draft.value || !elementDraft.value) return;
  if (!draft.value.elements) draft.value.elements = [];
  const row: AdvancedElement = {
    name: elementDraft.value.name,
    tag: elementDraft.value.tag,
    insert_trigger: elementDraft.value.insert_trigger
      ? ensureTrigger(elementDraft.value.insert_trigger)
      : undefined,
  };
  if (elementEditIndex.value < 0) {
    draft.value.elements.push(row);
  } else {
    draft.value.elements[elementEditIndex.value] = row;
  }
  elementDlgOpen.value = false;
}

function removeElement(idx: number) {
  draft.value?.elements?.splice(idx, 1);
}

function onOk() {
  if (!draft.value) return;
  if (!draft.value.name?.trim()) {
    ElMessage.warning($t('scada.advancedTags.tagNameRequired'));
    return;
  }
  emit('confirm', cloneTag(draft.value));
  open.value = false;
}

function insertByLabel(el: AdvancedElement) {
  const t = el.insert_trigger;
  if (!t) return '-';
  return t.mode === 'by_tag'
    ? `${$t('scada.advancedTags.byTag')}: ${t.trigger_tag || '-'}`
    : `${$t('scada.advancedTags.byRate')}: ${t.rate ?? 1} ${t.rate_unit || 's'}`;
}
</script>

<template>
  <ElDialog
    v-model="open"
    :title="title"
    width="640px"
    append-to-body
    destroy-on-close
    class="advanced-tag-dlg"
  >
    <ElForm v-if="draft" label-width="140px" size="default">
      <ElFormItem :label="$t('scada.advancedTags.tagName')" required>
        <ElInput v-model="draft.name" />
      </ElFormItem>
      <ElFormItem :label="$t('scada.advancedTags.enabled')">
        <ElSwitch v-model="draft.enabled" />
      </ElFormItem>

      <!-- Link -->
      <template v-if="draft.kind === 'link'">
        <ElFormItem :label="$t('scada.advancedTags.input')">
          <TagPathField v-model="draft.input" />
        </ElFormItem>
        <ElFormItem :label="$t('scada.advancedTags.output')">
          <TagPathField v-model="draft.output" />
        </ElFormItem>
        <ElFormItem :label="$t('scada.advancedTags.deadValue')">
          <ElInput v-model="draft.dead_value" />
        </ElFormItem>
        <ElFormItem :label="$t('scada.advancedTags.linkMode')">
          <ElSelect v-model="draft.link_mode" class="w-full">
            <ElOption
              value="on_data_change"
              :label="$t('scada.advancedTags.linkOnChange')"
            />
            <ElOption
              value="on_data_change_ignore_initial"
              :label="$t('scada.advancedTags.linkOnChangeIgnore')"
            />
            <ElOption
              value="on_interval"
              :label="$t('scada.advancedTags.linkOnInterval')"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem
          v-if="draft.link_mode === 'on_interval'"
          :label="$t('scada.advancedTags.linkRate')"
        >
          <ElInputNumber
            v-model="draft.update_rate_ms"
            :min="1"
            :step="100"
            class="w-full"
          />
        </ElFormItem>
        <ElFormItem :label="$t('scada.advancedTags.triggerType')">
          <ElSelect v-model="draft.trigger_type" class="w-full">
            <ElOption
              value="always"
              :label="$t('scada.advancedTags.triggerAlways')"
            />
            <ElOption
              value="while_true"
              :label="$t('scada.advancedTags.triggerWhileTrue')"
            />
            <ElOption
              value="on_true"
              :label="$t('scada.advancedTags.triggerOnTrue')"
            />
          </ElSelect>
        </ElFormItem>
        <template v-if="draft.trigger_type && draft.trigger_type !== 'always'">
          <ElFormItem :label="$t('scada.advancedTags.triggerTag')">
            <TagPathField v-model="draft.trigger_tag" />
          </ElFormItem>
          <ElFormItem :label="$t('scada.advancedTags.comparison')">
            <ElSelect v-model="draft.comparison" class="w-full">
              <ElOption
                v-for="op in ['==', '!=', '>', '>=', '<', '<=']"
                :key="op"
                :value="op"
                :label="op"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem :label="$t('scada.advancedTags.triggerValue')">
            <ElInput v-model="draft.trigger_value" />
          </ElFormItem>
          <ElFormItem :label="$t('scada.advancedTags.triggerScanRate')">
            <ElInputNumber
              v-model="draft.trigger_scan_rate_ms"
              :min="1"
              :step="100"
              class="w-full"
            />
          </ElFormItem>
        </template>
      </template>

      <!-- Aggregates -->
      <template
        v-if="
          draft.kind === 'average' ||
          draft.kind === 'minimum' ||
          draft.kind === 'maximum'
        "
      >
        <ElFormItem :label="$t('scada.advancedTags.source')">
          <TagPathField v-model="draft.source" />
        </ElFormItem>
        <ElFormItem :label="$t('scada.advancedTags.runTag')">
          <TagPathField v-model="draft.run_tag" />
        </ElFormItem>
      </template>

      <!-- Complex -->
      <template v-if="draft.kind === 'complex'">
        <ElFormItem :label="$t('scada.advancedTags.elements')">
          <div class="w-full">
            <div class="mb-2 flex gap-1">
              <ElButton size="small" @click="openAddElement">
                {{ $t('scada.advancedTags.addElement') }}
              </ElButton>
            </div>
            <ElTable :data="draft.elements || []" size="small" border>
              <ElTableColumn
                prop="name"
                :label="$t('scada.advancedTags.elementName')"
                width="100"
              />
              <ElTableColumn
                prop="tag"
                :label="$t('scada.advancedTags.elementTag')"
                min-width="140"
              />
              <ElTableColumn
                :label="$t('scada.advancedTags.insertBy')"
                min-width="120"
              >
                <template #default="{ row }">
                  {{ insertByLabel(row as AdvancedElement) }}
                </template>
              </ElTableColumn>
              <ElTableColumn
                :label="$t('scada.advancedTags.actions')"
                width="140"
              >
                <template #default="{ $index }">
                  <ElButton
                    link
                    type="primary"
                    size="small"
                    @click="openEditElement($index)"
                  >
                    {{ $t('scada.advancedTags.edit') }}
                  </ElButton>
                  <ElButton
                    link
                    type="danger"
                    size="small"
                    @click="removeElement($index)"
                  >
                    {{ $t('scada.advancedTags.deleteElement') }}
                  </ElButton>
                </template>
              </ElTableColumn>
            </ElTable>
          </div>
        </ElFormItem>
        <ElFormItem
          v-if="draft.send_trigger"
          :label="$t('scada.advancedTags.sendTrigger')"
        >
          <div class="flex w-full flex-col gap-2">
            <ElSelect
              :model-value="draft.send_trigger.mode"
              class="w-full"
              @update:model-value="
                (m: AdvancedTrigger['mode']) => {
                  if (draft?.send_trigger) onTriggerMode(draft.send_trigger, m);
                }
              "
            >
              <ElOption
                value="by_rate"
                :label="$t('scada.advancedTags.byRate')"
              />
              <ElOption
                value="by_tag"
                :label="$t('scada.advancedTags.byTag')"
              />
            </ElSelect>
            <template v-if="draft.send_trigger.mode === 'by_rate'">
              <div class="flex gap-2">
                <ElInputNumber
                  v-model="draft.send_trigger.rate"
                  :min="0.001"
                  class="flex-1"
                />
                <ElSelect v-model="draft.send_trigger.rate_unit" class="w-36">
                  <ElOption value="milliseconds" label="ms" />
                  <ElOption value="seconds" label="s" />
                  <ElOption value="minutes" label="min" />
                  <ElOption value="hours" label="h" />
                  <ElOption value="days" label="d" />
                </ElSelect>
              </div>
            </template>
            <template v-else>
              <TagPathField v-model="draft.send_trigger.trigger_tag" />
              <TagPathField
                v-model="draft.send_trigger.complete_tag"
                :placeholder="$t('scada.advancedTags.completeTag')"
              />
            </template>
          </div>
        </ElFormItem>
      </template>

      <!-- Derived -->
      <template v-if="draft.kind === 'derived'">
        <ElFormItem :label="$t('scada.advancedTags.expression')">
          <div class="w-full">
            <div class="mb-1 flex flex-wrap gap-1">
              <ElButton
                v-for="s in exprSnippets"
                :key="s.label"
                size="small"
                @click="insertSnippet(s.insert)"
              >
                {{ s.label }}
              </ElButton>
              <ElButton
                size="small"
                type="primary"
                plain
                :loading="validating"
                @click="checkExpression"
              >
                {{ $t('scada.advancedTags.checkExpression') }} (Alt+K)
              </ElButton>
            </div>
            <ElInput
              v-model="draft.expression"
              type="textarea"
              :rows="5"
              class="font-mono"
            />
          </div>
        </ElFormItem>
        <ElFormItem
          v-if="draft.trigger"
          :label="$t('scada.advancedTags.triggerMode')"
        >
          <div class="flex w-full flex-col gap-2">
            <ElSelect
              :model-value="draft.trigger.mode"
              class="w-full"
              @update:model-value="
                (m: AdvancedTrigger['mode']) => {
                  if (draft?.trigger) onTriggerMode(draft.trigger, m);
                }
              "
            >
              <ElOption
                value="by_rate"
                :label="$t('scada.advancedTags.byRate')"
              />
              <ElOption
                value="by_tag"
                :label="$t('scada.advancedTags.byTag')"
              />
            </ElSelect>
            <template v-if="draft.trigger.mode === 'by_rate'">
              <div class="flex gap-2">
                <ElInputNumber
                  v-model="draft.trigger.rate"
                  :min="0.001"
                  class="flex-1"
                />
                <ElSelect v-model="draft.trigger.rate_unit" class="w-36">
                  <ElOption value="milliseconds" label="ms" />
                  <ElOption value="seconds" label="s" />
                  <ElOption value="minutes" label="min" />
                  <ElOption value="hours" label="h" />
                  <ElOption value="days" label="d" />
                </ElSelect>
              </div>
            </template>
            <template v-else>
              <TagPathField v-model="draft.trigger.trigger_tag" />
              <TagPathField v-model="draft.trigger.complete_tag" />
            </template>
          </div>
        </ElFormItem>
      </template>

      <!-- Cumulative -->
      <template v-if="draft.kind === 'cumulative'">
        <ElFormItem :label="$t('scada.advancedTags.source')">
          <TagPathField v-model="draft.source" />
        </ElFormItem>
        <ElFormItem :label="$t('scada.advancedTags.dataType')">
          <ElSelect v-model="draft.max_type" class="w-full">
            <ElOption value="byte" label="Byte" />
            <ElOption value="word" label="Word" />
            <ElOption value="dword" label="DWord" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem :label="$t('scada.advancedTags.maxValue')">
          <ElInputNumber
            v-model="draft.max_value"
            :min="0"
            class="w-full"
            controls-position="right"
          />
        </ElFormItem>
      </template>
    </ElForm>

    <template #footer>
      <ElButton @click="open = false">
        {{ $t('scada.advancedTags.cancel') }}
      </ElButton>
      <ElButton type="primary" @click="onOk">
        {{ $t('scada.advancedTags.ok') }}
      </ElButton>
    </template>
  </ElDialog>

  <!-- Complex element sub-dialog -->
  <ElDialog
    v-model="elementDlgOpen"
    :title="$t('scada.advancedTags.elementDialog')"
    width="480px"
    append-to-body
    destroy-on-close
  >
    <ElForm v-if="elementDraft" label-width="120px">
      <ElFormItem :label="$t('scada.advancedTags.elementName')">
        <ElInput v-model="elementDraft.name" />
      </ElFormItem>
      <ElFormItem :label="$t('scada.advancedTags.elementTag')">
        <TagPathField v-model="elementDraft.tag" />
      </ElFormItem>
      <ElFormItem
        v-if="elementDraft.insert_trigger"
        :label="$t('scada.advancedTags.insertBy')"
      >
        <div class="flex w-full flex-col gap-2">
          <ElSelect
            :model-value="elementDraft.insert_trigger.mode"
            class="w-full"
            @update:model-value="
              (m: AdvancedTrigger['mode']) => {
                if (elementDraft?.insert_trigger) {
                  onTriggerMode(elementDraft.insert_trigger, m);
                }
              }
            "
          >
            <ElOption
              value="by_rate"
              :label="$t('scada.advancedTags.byRate')"
            />
            <ElOption value="by_tag" :label="$t('scada.advancedTags.byTag')" />
          </ElSelect>
          <template v-if="elementDraft.insert_trigger.mode === 'by_rate'">
            <div class="flex gap-2">
              <ElInputNumber
                v-model="elementDraft.insert_trigger.rate"
                :min="0.001"
                class="flex-1"
              />
              <ElSelect
                v-model="elementDraft.insert_trigger.rate_unit"
                class="w-36"
              >
                <ElOption value="milliseconds" label="ms" />
                <ElOption value="seconds" label="s" />
                <ElOption value="minutes" label="min" />
              </ElSelect>
            </div>
          </template>
          <TagPathField
            v-else
            v-model="elementDraft.insert_trigger.trigger_tag"
          />
        </div>
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="elementDlgOpen = false">
        {{ $t('scada.advancedTags.cancel') }}
      </ElButton>
      <ElButton type="primary" @click="confirmElement">
        {{ $t('scada.advancedTags.ok') }}
      </ElButton>
    </template>
  </ElDialog>
</template>
