<script lang="ts" setup>
import type {
  AdvancedElement,
  AdvancedKind,
  AdvancedTagDef,
  AdvancedTagGroup,
  AdvancedTagsConfig,
  AdvancedTrigger,
} from '#/api/scada';

import { computed, onMounted, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTree,
} from 'element-plus';

import {
  getAdvancedTags,
  putAdvancedTags,
  scadaErrorMessage,
  validateAdvancedExpression,
} from '#/api/scada';

type TreeKind = 'group' | 'root' | 'tag';

type TreeNode = {
  children?: TreeNode[];
  kind: TreeKind;
  label: string;
  path: string;
};

const props = withDefaults(
  defineProps<{
    embed?: boolean;
    focusPath?: string;
    hideTree?: boolean;
  }>(),
  {
    embed: false,
    focusPath: '',
    hideTree: false,
  },
);

const emit = defineEmits<{
  mutated: [config: AdvancedTagsConfig];
}>();

const config = ref<AdvancedTagsConfig>({ groups: [] });
const loading = ref(false);
const saving = ref(false);
const validating = ref(false);
const selectedPath = ref('');
const selectedKind = ref<TreeKind>('root');

const kinds: AdvancedKind[] = [
  'link',
  'average',
  'minimum',
  'maximum',
  'complex',
  'derived',
  'cumulative',
];

function emptyTrigger(
  mode: AdvancedTrigger['mode'] = 'by_rate',
): AdvancedTrigger {
  return {
    mode,
    rate: 1,
    rate_unit: 'seconds',
    trigger_tag: '',
    complete_tag: '',
  };
}

function buildGroupNodes(
  groups: AdvancedTagGroup[] | undefined,
  prefix: string,
): TreeNode[] {
  return (groups || []).map((g) => {
    const path = prefix ? `${prefix}/${g.name}` : g.name;
    const children: TreeNode[] = [
      ...buildGroupNodes(g.groups, path),
      ...(g.tags || []).map((t) => ({
        kind: 'tag' as const,
        label: `${t.name || '(tag)'} [${t.kind || '?'}]`,
        path: `${path}/${t.name}`,
      })),
    ];
    return {
      kind: 'group' as const,
      label: g.name || '(group)',
      path,
      children,
    };
  });
}

const treeData = computed(() => buildGroupNodes(config.value.groups, ''));

function findGroup(
  groups: AdvancedTagGroup[] | undefined,
  parts: string[],
): AdvancedTagGroup | null {
  if (!groups || parts.length === 0) return null;
  const g = groups.find((x) => x.name === parts[0]);
  if (!g) return null;
  if (parts.length === 1) return g;
  return findGroup(g.groups, parts.slice(1));
}

const selectedGroup = computed(() => {
  if (selectedKind.value !== 'group') return null;
  const parts = selectedPath.value.split('/').filter(Boolean);
  return findGroup(config.value.groups, parts);
});

const selectedTag = computed(() => {
  if (selectedKind.value !== 'tag') return null;
  const parts = selectedPath.value.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const g = findGroup(config.value.groups, parts.slice(0, -1));
  if (!g) return null;
  const name = parts[parts.length - 1];
  return (g.tags || []).find((t) => t.name === name) || null;
});

function applyFocusPath(path: string) {
  const p = (path || '').trim();
  if (!p) {
    selectedPath.value = '';
    selectedKind.value = 'root';
    return;
  }
  selectedPath.value = p;
  const parts = p.split('/').filter(Boolean);
  const g = findGroup(config.value.groups, parts);
  if (g) {
    selectedKind.value = 'group';
    return;
  }
  if (parts.length >= 2) {
    const parent = findGroup(config.value.groups, parts.slice(0, -1));
    const tag = parent?.tags?.find((t) => t.name === parts[parts.length - 1]);
    selectedKind.value = tag ? 'tag' : 'root';
    return;
  }
  selectedKind.value = 'root';
}

watch(
  () => props.focusPath,
  (path) => {
    if (!props.hideTree) return;
    if (path) applyFocusPath(path);
  },
  { immediate: true },
);

function onTreeClick(data: TreeNode) {
  selectedPath.value = data.path;
  selectedKind.value = data.kind;
}

function notifyMutated() {
  emit('mutated', {
    groups: structuredClone(config.value.groups || []),
  });
}

async function loadConfig() {
  loading.value = true;
  try {
    const body = await getAdvancedTags();
    config.value = {
      groups: body?.groups ? structuredClone(body.groups) : [],
    };
    if (props.hideTree && props.focusPath) {
      applyFocusPath(props.focusPath);
    }
  } catch (error) {
    ElMessage.error(
      `${$t('scada.advancedTags.loadFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    loading.value = false;
  }
}

async function saveConfig() {
  saving.value = true;
  try {
    const body = await putAdvancedTags(config.value);
    config.value = {
      groups: body?.groups ? structuredClone(body.groups) : config.value.groups,
    };
    ElMessage.success($t('scada.advancedTags.saved'));
    notifyMutated();
  } catch (error) {
    ElMessage.error(
      `${$t('scada.advancedTags.saveFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    saving.value = false;
  }
}

function addGroup() {
  const name = `Group${(config.value.groups?.length || 0) + 1}`;
  const g: AdvancedTagGroup = { name, enabled: true, tags: [], groups: [] };
  if (selectedKind.value === 'group' && selectedGroup.value) {
    selectedGroup.value.groups = [...(selectedGroup.value.groups || []), g];
    selectedPath.value = `${selectedPath.value}/${name}`;
  } else {
    config.value.groups = [...(config.value.groups || []), g];
    selectedPath.value = name;
  }
  selectedKind.value = 'group';
  notifyMutated();
}

function addTag() {
  const g = selectedGroup.value;
  if (!g && selectedKind.value === 'tag') {
    ElMessage.warning($t('scada.advancedTags.selectGroup'));
    return;
  }
  let group = g;
  let groupPath = selectedPath.value;
  if (selectedKind.value === 'tag') {
    const parts = selectedPath.value.split('/').filter(Boolean);
    group = findGroup(config.value.groups, parts.slice(0, -1));
    groupPath = parts.slice(0, -1).join('/');
  }
  if (!group) {
    ElMessage.warning($t('scada.advancedTags.selectGroup'));
    return;
  }
  const name = `Tag${(group.tags?.length || 0) + 1}`;
  const tag: AdvancedTagDef = {
    id: `at-${Date.now()}`,
    name,
    kind: 'link',
    enabled: true,
    link_mode: 'on_data_change',
    dead_value: '0',
    trigger: emptyTrigger(),
    send_trigger: emptyTrigger(),
    elements: [],
    max_type: 'byte',
  };
  group.tags = [...(group.tags || []), tag];
  selectedPath.value = `${groupPath}/${name}`;
  selectedKind.value = 'tag';
  notifyMutated();
}

function removeSelected() {
  const parts = selectedPath.value.split('/').filter(Boolean);
  if (parts.length === 0) return;
  if (selectedKind.value === 'group') {
    if (parts.length === 1) {
      config.value.groups = (config.value.groups || []).filter(
        (g) => g.name !== parts[0],
      );
    } else {
      const parent = findGroup(config.value.groups, parts.slice(0, -1));
      if (parent) {
        parent.groups = (parent.groups || []).filter(
          (g) => g.name !== parts[parts.length - 1],
        );
      }
    }
  } else if (selectedKind.value === 'tag') {
    const parent = findGroup(config.value.groups, parts.slice(0, -1));
    if (parent) {
      parent.tags = (parent.tags || []).filter(
        (t) => t.name !== parts[parts.length - 1],
      );
    }
  }
  selectedPath.value = '';
  selectedKind.value = 'root';
  notifyMutated();
}

function ensureTrigger(tag: AdvancedTagDef, field: 'send_trigger' | 'trigger') {
  const existing = tag[field];
  if (existing) {
    return existing;
  }
  const created = emptyTrigger();
  tag[field] = created;
  return created;
}

function addElement() {
  const tag = selectedTag.value;
  if (!tag) return;
  const el: AdvancedElement = {
    name: `E${(tag.elements?.length || 0) + 1}`,
    tag: '',
  };
  tag.elements = [...(tag.elements || []), el];
}

function removeElement(i: number) {
  const tag = selectedTag.value;
  if (!tag?.elements) return;
  tag.elements = tag.elements.filter((_, idx) => idx !== i);
}

async function checkExpression() {
  const tag = selectedTag.value;
  if (!tag?.expression) {
    ElMessage.warning($t('scada.advancedTags.expressionRequired'));
    return;
  }
  validating.value = true;
  try {
    const res = await validateAdvancedExpression(tag.expression);
    if (res.ok) {
      const note =
        res.value === undefined
          ? $t('scada.advancedTags.validateOk')
          : `${$t('scada.advancedTags.validateOk')} value=${res.value}`;
      ElMessage.success(note);
    } else {
      ElMessage.error(res.error || $t('scada.advancedTags.validateFailed'));
    }
  } catch (error) {
    ElMessage.error(
      `${$t('scada.advancedTags.validateFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    validating.value = false;
  }
}

onMounted(() => {
  void loadConfig();
});

defineExpose({ loadConfig, saveConfig });
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col gap-3"
    :class="embed ? 'p-2' : 'p-4'"
  >
    <div class="flex flex-wrap items-center gap-2">
      <h1 v-if="!embed" class="text-lg font-semibold">
        {{ $t('scada.advancedTags.title') }}
      </h1>
      <span v-if="!embed" class="text-muted-foreground text-sm">{{
        $t('scada.advancedTags.desc')
      }}</span>
      <span v-else class="text-sm font-medium">{{
        $t('scada.advancedTags.title')
      }}</span>
      <div class="ml-auto flex flex-wrap gap-2">
        <ElButton size="small" @click="addGroup">
          {{ $t('scada.advancedTags.addGroup') }}
        </ElButton>
        <ElButton size="small" @click="addTag">
          {{ $t('scada.advancedTags.addTag') }}
        </ElButton>
        <ElButton size="small" type="danger" @click="removeSelected">
          {{ $t('scada.advancedTags.delete') }}
        </ElButton>
        <ElButton :loading="loading" size="small" @click="loadConfig">
          {{ $t('scada.advancedTags.refresh') }}
        </ElButton>
        <ElButton
          type="primary"
          size="small"
          :loading="saving"
          @click="saveConfig"
        >
          {{ $t('scada.advancedTags.save') }}
        </ElButton>
      </div>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-12 gap-3">
      <div
        v-if="!hideTree"
        class="border-border col-span-3 flex flex-col gap-2 overflow-auto rounded border p-2"
      >
        <ElTree
          :data="treeData"
          node-key="path"
          default-expand-all
          highlight-current
          :current-node-key="selectedPath || undefined"
          :props="{ label: 'label', children: 'children' }"
          @node-click="onTreeClick"
        />
        <div v-if="!treeData.length" class="text-muted-foreground p-2 text-sm">
          {{ $t('scada.advancedTags.emptyTree') }}
        </div>
      </div>

      <div
        class="border-border overflow-auto rounded border p-3"
        :class="hideTree ? 'col-span-12' : 'col-span-9'"
      >
        <template v-if="selectedKind === 'group' && selectedGroup">
          <ElForm label-width="140px">
            <ElFormItem :label="$t('scada.advancedTags.groupName')">
              <ElInput v-model="selectedGroup.name" @change="notifyMutated" />
            </ElFormItem>
            <ElFormItem :label="$t('scada.advancedTags.enabled')">
              <ElSwitch
                v-model="selectedGroup.enabled"
                @change="notifyMutated"
              />
            </ElFormItem>
          </ElForm>
        </template>

        <template v-else-if="selectedKind === 'tag' && selectedTag">
          <ElForm label-width="140px">
            <ElFormItem :label="$t('scada.advancedTags.tagName')">
              <ElInput v-model="selectedTag.name" @change="notifyMutated" />
            </ElFormItem>
            <ElFormItem :label="$t('scada.advancedTags.kind')">
              <ElSelect v-model="selectedTag.kind" @change="notifyMutated">
                <ElOption
                  v-for="k in kinds"
                  :key="k"
                  :value="k"
                  :label="$t(`scada.advancedTags.kinds.${k}`)"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem :label="$t('scada.advancedTags.enabled')">
              <ElSwitch v-model="selectedTag.enabled" @change="notifyMutated" />
            </ElFormItem>

            <template v-if="selectedTag.kind === 'link'">
              <ElFormItem :label="$t('scada.advancedTags.input')">
                <ElInput v-model="selectedTag.input" />
              </ElFormItem>
              <ElFormItem :label="$t('scada.advancedTags.output')">
                <ElInput v-model="selectedTag.output" />
              </ElFormItem>
              <ElFormItem :label="$t('scada.advancedTags.deadValue')">
                <ElInput v-model="selectedTag.dead_value" />
              </ElFormItem>
              <ElFormItem :label="$t('scada.advancedTags.linkMode')">
                <ElSelect v-model="selectedTag.link_mode">
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
                v-if="selectedTag.link_mode === 'on_interval'"
                :label="$t('scada.advancedTags.updateRateMs')"
              >
                <ElInputNumber
                  v-model="selectedTag.update_rate_ms"
                  :min="10"
                  :step="100"
                />
              </ElFormItem>
            </template>

            <template
              v-if="
                selectedTag.kind === 'average' ||
                selectedTag.kind === 'minimum' ||
                selectedTag.kind === 'maximum'
              "
            >
              <ElFormItem :label="$t('scada.advancedTags.source')">
                <ElInput v-model="selectedTag.source" />
              </ElFormItem>
              <ElFormItem :label="$t('scada.advancedTags.runTag')">
                <ElInput v-model="selectedTag.run_tag" />
              </ElFormItem>
            </template>

            <template v-if="selectedTag.kind === 'complex'">
              <ElFormItem :label="$t('scada.advancedTags.elements')">
                <div class="flex w-full flex-col gap-2">
                  <div
                    v-for="(el, i) in selectedTag.elements || []"
                    :key="i"
                    class="flex gap-2"
                  >
                    <ElInput
                      v-model="el.name"
                      :placeholder="$t('scada.advancedTags.elementName')"
                    />
                    <ElInput
                      v-model="el.tag"
                      :placeholder="$t('scada.advancedTags.elementTag')"
                    />
                    <ElButton size="small" @click="removeElement(i)">
                      {{ $t('scada.advancedTags.delete') }}
                    </ElButton>
                  </div>
                  <ElButton size="small" @click="addElement">
                    {{ $t('scada.advancedTags.addElement') }}
                  </ElButton>
                </div>
              </ElFormItem>
              <ElFormItem :label="$t('scada.advancedTags.triggerMode')">
                <ElSelect
                  v-model="ensureTrigger(selectedTag, 'send_trigger').mode"
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
              </ElFormItem>
              <template
                v-if="
                  ensureTrigger(selectedTag, 'send_trigger').mode === 'by_rate'
                "
              >
                <ElFormItem :label="$t('scada.advancedTags.rate')">
                  <ElInputNumber
                    v-model="ensureTrigger(selectedTag, 'send_trigger').rate"
                    :min="0.001"
                  />
                </ElFormItem>
                <ElFormItem :label="$t('scada.advancedTags.rateUnit')">
                  <ElSelect
                    v-model="
                      ensureTrigger(selectedTag, 'send_trigger').rate_unit
                    "
                  >
                    <ElOption value="milliseconds" label="ms" />
                    <ElOption value="seconds" label="s" />
                    <ElOption value="minutes" label="min" />
                    <ElOption value="hours" label="h" />
                  </ElSelect>
                </ElFormItem>
              </template>
              <template v-else>
                <ElFormItem :label="$t('scada.advancedTags.triggerTag')">
                  <ElInput
                    v-model="
                      ensureTrigger(selectedTag, 'send_trigger').trigger_tag
                    "
                  />
                </ElFormItem>
                <ElFormItem :label="$t('scada.advancedTags.completeTag')">
                  <ElInput
                    v-model="
                      ensureTrigger(selectedTag, 'send_trigger').complete_tag
                    "
                  />
                </ElFormItem>
              </template>
            </template>

            <template v-if="selectedTag.kind === 'derived'">
              <ElFormItem :label="$t('scada.advancedTags.expression')">
                <ElInput
                  v-model="selectedTag.expression"
                  type="textarea"
                  :rows="3"
                  placeholder="TAG (Sim.Dev.A) + ABS (-1)"
                />
              </ElFormItem>
              <ElFormItem>
                <ElButton
                  size="small"
                  :loading="validating"
                  @click="checkExpression"
                >
                  {{ $t('scada.advancedTags.checkExpression') }}
                </ElButton>
              </ElFormItem>
              <ElFormItem :label="$t('scada.advancedTags.triggerMode')">
                <ElSelect v-model="ensureTrigger(selectedTag, 'trigger').mode">
                  <ElOption
                    value="by_rate"
                    :label="$t('scada.advancedTags.byRate')"
                  />
                  <ElOption
                    value="by_tag"
                    :label="$t('scada.advancedTags.byTag')"
                  />
                </ElSelect>
              </ElFormItem>
              <template
                v-if="ensureTrigger(selectedTag, 'trigger').mode === 'by_rate'"
              >
                <ElFormItem :label="$t('scada.advancedTags.rate')">
                  <ElInputNumber
                    v-model="ensureTrigger(selectedTag, 'trigger').rate"
                    :min="0.001"
                  />
                </ElFormItem>
                <ElFormItem :label="$t('scada.advancedTags.rateUnit')">
                  <ElSelect
                    v-model="ensureTrigger(selectedTag, 'trigger').rate_unit"
                  >
                    <ElOption value="milliseconds" label="ms" />
                    <ElOption value="seconds" label="s" />
                    <ElOption value="minutes" label="min" />
                  </ElSelect>
                </ElFormItem>
              </template>
              <template v-else>
                <ElFormItem :label="$t('scada.advancedTags.triggerTag')">
                  <ElInput
                    v-model="ensureTrigger(selectedTag, 'trigger').trigger_tag"
                  />
                </ElFormItem>
                <ElFormItem :label="$t('scada.advancedTags.completeTag')">
                  <ElInput
                    v-model="ensureTrigger(selectedTag, 'trigger').complete_tag"
                  />
                </ElFormItem>
              </template>
            </template>

            <template v-if="selectedTag.kind === 'cumulative'">
              <ElFormItem :label="$t('scada.advancedTags.source')">
                <ElInput v-model="selectedTag.source" />
              </ElFormItem>
              <ElFormItem :label="$t('scada.advancedTags.maxType')">
                <ElSelect v-model="selectedTag.max_type">
                  <ElOption value="byte" label="Byte" />
                  <ElOption value="word" label="Word" />
                  <ElOption value="dword" label="DWord" />
                </ElSelect>
              </ElFormItem>
              <ElFormItem :label="$t('scada.advancedTags.maxValue')">
                <ElInputNumber
                  v-model="selectedTag.max_value"
                  :min="0"
                  :controls="false"
                />
              </ElFormItem>
            </template>
          </ElForm>
        </template>

        <div v-else class="text-muted-foreground text-sm">
          {{
            hideTree
              ? $t('scada.advancedTags.selectFromTree')
              : $t('scada.advancedTags.selectNode')
          }}
        </div>
      </div>
    </div>
  </div>
</template>
