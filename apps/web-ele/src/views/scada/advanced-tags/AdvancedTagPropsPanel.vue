<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props --
 * Inspector edits the live Advanced Tags config object; parent owns dirty/persist.
 */
import type {
  AdvancedElement,
  AdvancedKind,
  AdvancedPropsFocus,
  AdvancedTagDef,
  AdvancedTagGroup,
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
  propertyGroupsForSelection,
  scadaErrorMessage,
  validateAdvancedExpression,
} from '#/api/scada';

import PropertySheet from '../components/PropertySheet.vue';
import TagPathField from './TagPathField.vue';

const props = defineProps<{
  focus: AdvancedPropsFocus;
  tag: AdvancedTagDef | null;
  group: AdvancedTagGroup | null;
  /** Parent PUT in flight (PropertySheet Save). */
  saving?: boolean;
}>();

const emit = defineEmits<{
  change: [];
  groupRename: [name: string];
  save: [];
}>();

const validating = ref(false);
const elementEditIndex = ref(-1);
const elementDraft = ref<AdvancedElement | null>(null);
const elementDlgOpen = ref(false);
const groupNameDraft = ref('');

watch(
  () => props.group?.name,
  (n) => {
    groupNameDraft.value = n || '';
  },
  { immediate: true },
);

const groups = computed(() => {
  const defs = propertyGroupsForSelection(
    props.focus,
    props.tag?.kind as AdvancedKind | undefined,
  );
  return defs.map((d) => ({
    key: d.key,
    label: $t(d.labelKey),
  }));
});

const showAggregateDataType = computed(() => {
  const k = props.tag?.kind;
  return k === 'average' || k === 'minimum' || k === 'maximum';
});

const exprSnippets = [
  { label: 'TAG()', insert: 'TAG("")' },
  { label: 'QUALITY()', insert: 'QUALITY("")' },
  { label: 'ABS()', insert: 'ABS()' },
  { label: 'SQRT()', insert: 'SQRT()' },
  { label: 'POW()', insert: 'POW(,)' },
  { label: 'SIN()', insert: 'SIN()' },
  { label: 'COS()', insert: 'COS()' },
  { label: 'TAN()', insert: 'TAN()' },
  { label: 'ASIN()', insert: 'ASIN()' },
  { label: 'ACOS()', insert: 'ACOS()' },
  { label: 'ATAN()', insert: 'ATAN()' },
  { label: 'AND', insert: ' AND ' },
  { label: 'OR', insert: ' OR ' },
  { label: 'NOT', insert: 'NOT ' },
  { label: 'TRUE', insert: 'TRUE' },
  { label: 'FALSE', insert: 'FALSE' },
  { label: 'ON', insert: 'ON' },
  { label: 'OFF', insert: 'OFF' },
  { label: '+', insert: ' + ' },
  { label: '-', insert: ' - ' },
  { label: '*', insert: ' * ' },
  { label: '/', insert: ' / ' },
  { label: '%', insert: ' % ' },
];

const derivedDataTypes = [
  'String',
  'Boolean',
  'Char',
  'Byte',
  'Short',
  'Word',
  'Long',
  'DWord',
  'Float',
  'Double',
];

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

function bump() {
  emit('change');
}

function onTriggerMode(trig: AdvancedTrigger, mode: AdvancedTrigger['mode']) {
  trig.mode = mode;
  if (mode === 'by_rate') {
    if (!trig.rate) trig.rate = 1;
    if (!trig.rate_unit) trig.rate_unit = 'seconds';
  }
  bump();
}

function insertSnippet(text: string) {
  if (!props.tag) return;
  props.tag.expression = (props.tag.expression || '') + text;
  bump();
}

async function checkExpression() {
  if (!props.tag?.expression?.trim()) {
    ElMessage.warning($t('scada.advancedTags.expressionRequired'));
    return;
  }
  validating.value = true;
  try {
    const r = await validateAdvancedExpression(props.tag.expression);
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
  if (!props.tag) return;
  elementEditIndex.value = -1;
  elementDraft.value = {
    name: `E${(props.tag.elements?.length || 0) + 1}`,
    tag: '',
    insert_trigger: emptyTrigger('by_rate'),
  };
  elementDlgOpen.value = true;
}

function openEditElement(idx: number) {
  const el = props.tag?.elements?.[idx];
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
  if (!props.tag || !elementDraft.value) return;
  if (!props.tag.elements) props.tag.elements = [];
  const row: AdvancedElement = {
    name: elementDraft.value.name,
    tag: elementDraft.value.tag,
    insert_trigger: elementDraft.value.insert_trigger
      ? ensureTrigger(elementDraft.value.insert_trigger)
      : undefined,
  };
  if (elementEditIndex.value < 0) {
    props.tag.elements.push(row);
  } else {
    props.tag.elements[elementEditIndex.value] = row;
  }
  elementDlgOpen.value = false;
  bump();
}

function removeElement(idx: number) {
  props.tag?.elements?.splice(idx, 1);
  bump();
}

function insertByLabel(el: AdvancedElement) {
  const t = el.insert_trigger;
  if (!t) return '-';
  return t.mode === 'by_tag'
    ? `${$t('scada.advancedTags.byTag')}: ${t.trigger_tag || '-'}`
    : `${$t('scada.advancedTags.byRate')}: ${t.rate ?? 1} ${t.rate_unit || 's'}`;
}

function commitGroupName() {
  const name = groupNameDraft.value.trim();
  if (!name || !props.group) return;
  if (name === props.group.name) return;
  emit('groupRename', name);
}

function onGroupEnabled(v: boolean | number | string) {
  if (!props.group) return;
  props.group.enabled = Boolean(v);
  bump();
}

watch(
  () => props.tag,
  (t) => {
    if (!t) return;
    if (t.kind === 'complex' && !t.send_trigger) {
      t.send_trigger = emptyTrigger('by_rate');
    }
    if (t.kind === 'derived' && !t.trigger) {
      t.trigger = emptyTrigger('by_rate');
    }
    if (t.kind === 'derived' && !t.data_type) {
      t.data_type = 'Double';
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div
      v-if="focus === 'empty' || focus === 'root'"
      class="text-muted-foreground p-3 text-xs"
    >
      {{ $t('scada.advancedTags.selectForProps') }}
    </div>

    <template v-else>
      <ElForm
        class="min-h-0 flex-1 overflow-auto p-1"
        label-position="right"
        label-width="96px"
        size="small"
      >
        <PropertySheet :groups="groups">
          <template #group>
            <ElFormItem :label="$t('scada.advancedTags.groupName')">
              <ElInput
                v-model="groupNameDraft"
                @change="commitGroupName"
                @blur="commitGroupName"
              />
            </ElFormItem>
            <ElFormItem :label="$t('scada.advancedTags.enabled')">
              <ElSwitch
                :model-value="group?.enabled !== false"
                @change="onGroupEnabled"
              />
            </ElFormItem>
          </template>

          <template #identification>
            <template v-if="tag">
              <ElFormItem :label="$t('scada.advancedTags.tagType')">
                <ElSelect :model-value="tag.kind" disabled class="w-full">
                  <ElOption
                    :value="tag.kind"
                    :label="$t(`scada.advancedTags.kinds.${tag.kind}`)"
                  />
                </ElSelect>
              </ElFormItem>
              <ElFormItem :label="$t('scada.advancedTags.tagName')" required>
                <ElInput v-model="tag.name" @change="bump" />
              </ElFormItem>
              <ElFormItem :label="$t('scada.advancedTags.description')">
                <ElInput v-model="tag.description" @change="bump" />
              </ElFormItem>
              <ElFormItem :label="$t('scada.advancedTags.enabled')">
                <ElSwitch v-model="tag.enabled" @change="bump" />
              </ElFormItem>
            </template>
          </template>

          <template #configuration>
            <template v-if="tag">
              <!-- Link -->
              <template v-if="tag.kind === 'link'">
                <ElFormItem :label="$t('scada.advancedTags.input')">
                  <TagPathField
                    v-model="tag.input"
                    @update:model-value="bump"
                  />
                </ElFormItem>
                <ElFormItem :label="$t('scada.advancedTags.output')">
                  <TagPathField
                    v-model="tag.output"
                    @update:model-value="bump"
                  />
                </ElFormItem>
                <ElFormItem :label="$t('scada.advancedTags.deadValue')">
                  <ElInput v-model="tag.dead_value" @change="bump" />
                </ElFormItem>
                <ElFormItem :label="$t('scada.advancedTags.linkMode')">
                  <ElSelect
                    v-model="tag.link_mode"
                    class="w-full"
                    @change="bump"
                  >
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
                  v-if="tag.link_mode === 'on_interval'"
                  :label="$t('scada.advancedTags.linkRate')"
                >
                  <ElInputNumber
                    v-model="tag.update_rate_ms"
                    :min="1"
                    :step="100"
                    class="w-full"
                    @change="bump"
                  />
                </ElFormItem>
                <ElFormItem :label="$t('scada.advancedTags.triggerType')">
                  <ElSelect
                    v-model="tag.trigger_type"
                    class="w-full"
                    @change="bump"
                  >
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
                <template
                  v-if="tag.trigger_type && tag.trigger_type !== 'always'"
                >
                  <ElFormItem :label="$t('scada.advancedTags.triggerTag')">
                    <TagPathField
                      v-model="tag.trigger_tag"
                      @update:model-value="bump"
                    />
                  </ElFormItem>
                  <ElFormItem :label="$t('scada.advancedTags.comparison')">
                    <ElSelect
                      v-model="tag.comparison"
                      class="w-full"
                      @change="bump"
                    >
                      <ElOption
                        v-for="op in ['==', '!=', '>', '>=', '<', '<=']"
                        :key="op"
                        :value="op"
                        :label="op"
                      />
                    </ElSelect>
                  </ElFormItem>
                  <ElFormItem :label="$t('scada.advancedTags.triggerValue')">
                    <ElInput v-model="tag.trigger_value" @change="bump" />
                  </ElFormItem>
                  <ElFormItem :label="$t('scada.advancedTags.triggerScanRate')">
                    <ElInputNumber
                      v-model="tag.trigger_scan_rate_ms"
                      :min="1"
                      :step="100"
                      class="w-full"
                      @change="bump"
                    />
                  </ElFormItem>
                </template>
              </template>

              <!-- Aggregates -->
              <template
                v-if="
                  tag.kind === 'average' ||
                  tag.kind === 'minimum' ||
                  tag.kind === 'maximum'
                "
              >
                <ElFormItem :label="$t('scada.advancedTags.source')">
                  <TagPathField
                    v-model="tag.source"
                    @update:model-value="bump"
                  />
                </ElFormItem>
                <ElFormItem
                  v-if="showAggregateDataType"
                  :label="$t('scada.advancedTags.dataType')"
                >
                  <ElSelect model-value="Double" disabled class="w-full">
                    <ElOption value="Double" label="Double" />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem :label="$t('scada.advancedTags.runTag')">
                  <TagPathField
                    v-model="tag.run_tag"
                    @update:model-value="bump"
                  />
                </ElFormItem>
              </template>

              <!-- Complex -->
              <template v-if="tag.kind === 'complex'">
                <ElFormItem :label="$t('scada.advancedTags.elements')">
                  <div class="w-full">
                    <div class="mb-2 flex gap-1">
                      <ElButton size="small" @click="openAddElement">
                        {{ $t('scada.advancedTags.addElement') }}
                      </ElButton>
                    </div>
                    <ElTable :data="tag.elements || []" size="small" border>
                      <ElTableColumn
                        prop="name"
                        :label="$t('scada.advancedTags.elementName')"
                        width="80"
                      />
                      <ElTableColumn
                        prop="tag"
                        :label="$t('scada.advancedTags.elementTag')"
                        min-width="100"
                      />
                      <ElTableColumn
                        :label="$t('scada.advancedTags.insertBy')"
                        min-width="90"
                      >
                        <template #default="{ row }">
                          {{ insertByLabel(row as AdvancedElement) }}
                        </template>
                      </ElTableColumn>
                      <ElTableColumn
                        :label="$t('scada.advancedTags.actions')"
                        width="110"
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
                  v-if="tag.send_trigger"
                  :label="$t('scada.advancedTags.sendTrigger')"
                >
                  <div class="flex w-full flex-col gap-2">
                    <ElSelect
                      :model-value="tag.send_trigger.mode"
                      class="w-full"
                      @update:model-value="
                        (m: AdvancedTrigger['mode']) => {
                          if (tag?.send_trigger)
                            onTriggerMode(tag.send_trigger, m);
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
                    <template v-if="tag.send_trigger.mode === 'by_rate'">
                      <div class="flex gap-2">
                        <ElInputNumber
                          v-model="tag.send_trigger.rate"
                          :min="0.001"
                          class="flex-1"
                          @change="bump"
                        />
                        <ElSelect
                          v-model="tag.send_trigger.rate_unit"
                          class="w-28"
                          @change="bump"
                        >
                          <ElOption value="milliseconds" label="ms" />
                          <ElOption value="seconds" label="s" />
                          <ElOption value="minutes" label="min" />
                          <ElOption value="hours" label="h" />
                          <ElOption value="days" label="d" />
                        </ElSelect>
                      </div>
                    </template>
                    <template v-else>
                      <TagPathField
                        v-model="tag.send_trigger.trigger_tag"
                        @update:model-value="bump"
                      />
                      <TagPathField
                        v-model="tag.send_trigger.complete_tag"
                        :placeholder="$t('scada.advancedTags.completeTag')"
                        @update:model-value="bump"
                      />
                    </template>
                  </div>
                </ElFormItem>
              </template>

              <!-- Derived -->
              <template v-if="tag.kind === 'derived'">
                <ElFormItem :label="$t('scada.advancedTags.dataType')">
                  <ElSelect
                    v-model="tag.data_type"
                    class="w-full"
                    @change="bump"
                  >
                    <ElOption
                      v-for="dt in derivedDataTypes"
                      :key="dt"
                      :value="dt"
                      :label="dt"
                    />
                  </ElSelect>
                </ElFormItem>
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
                        {{ $t('scada.advancedTags.checkExpression') }}
                      </ElButton>
                    </div>
                    <ElInput
                      v-model="tag.expression"
                      type="textarea"
                      :rows="4"
                      class="font-mono"
                      @change="bump"
                    />
                  </div>
                </ElFormItem>
                <ElFormItem
                  v-if="tag.trigger"
                  :label="$t('scada.advancedTags.triggerMode')"
                >
                  <div class="flex w-full flex-col gap-2">
                    <ElSelect
                      :model-value="tag.trigger.mode"
                      class="w-full"
                      @update:model-value="
                        (m: AdvancedTrigger['mode']) => {
                          if (tag?.trigger) onTriggerMode(tag.trigger, m);
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
                    <template v-if="tag.trigger.mode === 'by_rate'">
                      <div class="flex gap-2">
                        <ElInputNumber
                          v-model="tag.trigger.rate"
                          :min="0.001"
                          class="flex-1"
                          @change="bump"
                        />
                        <ElSelect
                          v-model="tag.trigger.rate_unit"
                          class="w-28"
                          @change="bump"
                        >
                          <ElOption value="milliseconds" label="ms" />
                          <ElOption value="seconds" label="s" />
                          <ElOption value="minutes" label="min" />
                          <ElOption value="hours" label="h" />
                          <ElOption value="days" label="d" />
                        </ElSelect>
                      </div>
                    </template>
                    <template v-else>
                      <TagPathField
                        v-model="tag.trigger.trigger_tag"
                        @update:model-value="bump"
                      />
                      <TagPathField
                        v-model="tag.trigger.complete_tag"
                        :placeholder="$t('scada.advancedTags.completeTag')"
                        @update:model-value="bump"
                      />
                    </template>
                  </div>
                </ElFormItem>
              </template>

              <!-- Cumulative -->
              <template v-if="tag.kind === 'cumulative'">
                <ElFormItem :label="$t('scada.advancedTags.source')">
                  <TagPathField
                    v-model="tag.source"
                    @update:model-value="bump"
                  />
                </ElFormItem>
                <ElFormItem :label="$t('scada.advancedTags.dataType')">
                  <ElSelect
                    v-model="tag.max_type"
                    class="w-full"
                    @change="bump"
                  >
                    <ElOption value="byte" label="Byte" />
                    <ElOption value="word" label="Word" />
                    <ElOption value="dword" label="DWord" />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem :label="$t('scada.advancedTags.maxValue')">
                  <ElInputNumber
                    v-model="tag.max_value"
                    :min="0"
                    class="w-full"
                    controls-position="right"
                    @change="bump"
                  />
                </ElFormItem>
              </template>
            </template>
          </template>
        </PropertySheet>
      </ElForm>

      <div
        class="sticky bottom-0 flex shrink-0 justify-end bg-background/95 px-2 py-2 backdrop-blur"
      >
        <ElButton
          type="primary"
          size="small"
          :loading="saving"
          @click="emit('save')"
        >
          {{ $t('scada.advancedTags.save') }}
        </ElButton>
      </div>
    </template>

    <!-- Complex element sub-dialog (create/edit still modal) -->
    <ElDialog
      v-model="elementDlgOpen"
      :title="$t('scada.advancedTags.elementDialog')"
      width="480px"
      append-to-body
      destroy-on-close
    >
      <ElForm v-if="elementDraft" label-width="100px" size="small">
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
              <ElOption
                value="by_tag"
                :label="$t('scada.advancedTags.byTag')"
              />
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
                  class="w-28"
                >
                  <ElOption value="milliseconds" label="ms" />
                  <ElOption value="seconds" label="s" />
                  <ElOption value="minutes" label="min" />
                </ElSelect>
              </div>
            </template>
            <template v-else>
              <TagPathField
                v-model="elementDraft.insert_trigger.trigger_tag"
                :placeholder="$t('scada.advancedTags.triggerTag')"
              />
              <TagPathField
                v-model="elementDraft.insert_trigger.complete_tag"
                :placeholder="$t('scada.advancedTags.completeTag')"
              />
            </template>
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
  </div>
</template>
