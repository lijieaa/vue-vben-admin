<script lang="ts" setup>
import type {
  AdvancedKind,
  AdvancedTagDef,
  AdvancedTagGroup,
  AdvancedTagsConfig,
} from '#/api/scada';

import { computed, onMounted, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTree,
} from 'element-plus';

import {
  getAdvancedTags,
  putAdvancedTags,
  scadaErrorMessage,
} from '#/api/scada';

import AdvancedTagDialog from './AdvancedTagDialog.vue';

type TreeKind = 'group' | 'root';

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

const KINDS: AdvancedKind[] = [
  'link',
  'average',
  'minimum',
  'maximum',
  'complex',
  'derived',
  'cumulative',
];

const config = ref<AdvancedTagsConfig>({ groups: [] });
const loading = ref(false);
const saving = ref(false);
const dirty = ref(false);
const selectedGroupPath = ref('');
const selectedTagId = ref('');
const selectedRow = ref<AdvancedTagDef | null>(null);

const dlgOpen = ref(false);
const dlgKind = ref<AdvancedKind>('link');
const dlgInitial = ref<AdvancedTagDef | null>(null);

const groupDlgOpen = ref(false);
const groupDlgName = ref('');
const groupDlgEnabled = ref(true);
const groupDlgEditPath = ref('');

function markDirty() {
  dirty.value = true;
}

function buildGroupNodes(
  groups: AdvancedTagGroup[] | undefined,
  prefix: string,
): TreeNode[] {
  return (groups || []).map((g) => {
    const path = prefix ? `${prefix}/${g.name}` : g.name;
    return {
      kind: 'group' as const,
      label: g.name,
      path,
      children: buildGroupNodes(g.groups, path),
    };
  });
}

const treeData = computed<TreeNode[]>(() => [
  {
    kind: 'root',
    label: $t('scada.advancedTags.title'),
    path: '',
    children: buildGroupNodes(config.value.groups, ''),
  },
]);

function findGroup(
  groups: AdvancedTagGroup[] | undefined,
  path: string,
): AdvancedTagGroup | null {
  if (!path) return null;
  const parts = path.split('/').filter(Boolean);
  let list = groups || [];
  let cur: AdvancedTagGroup | null = null;
  for (const p of parts) {
    cur = list.find((g) => g.name === p) || null;
    if (!cur) return null;
    list = cur.groups || [];
  }
  return cur;
}

function ensureGroupPath(path: string): AdvancedTagGroup | null {
  if (!path) return null;
  const parts = path.split('/').filter(Boolean);
  let list = config.value.groups;
  let cur: AdvancedTagGroup | null = null;
  for (const p of parts) {
    cur = list.find((g) => g.name === p) || null;
    if (!cur) {
      cur = { name: p, enabled: true, groups: [], tags: [] };
      list.push(cur);
    }
    if (!cur.groups) cur.groups = [];
    if (!cur.tags) cur.tags = [];
    list = cur.groups;
  }
  return cur;
}

const activeGroup = computed(() =>
  findGroup(config.value.groups, selectedGroupPath.value),
);

const listRows = computed(() => {
  const g = activeGroup.value;
  if (!g) {
    if (!selectedGroupPath.value) {
      return [];
    }
    return [];
  }
  return g.tags || [];
});

const listHint = computed(() => {
  if (!selectedGroupPath.value) {
    return $t('scada.advancedTags.selectGroupOrRoot');
  }
  if (listRows.value.length === 0) {
    return $t('scada.advancedTags.emptyList');
  }
  return '';
});

function summaryFor(tag: AdvancedTagDef): string {
  switch (tag.kind) {
    case 'link': {
      return tag.input || tag.output || '-';
    }
    case 'average':
    case 'minimum':
    case 'maximum':
    case 'cumulative': {
      return tag.source || '-';
    }
    case 'derived': {
      return tag.expression || '-';
    }
    case 'complex': {
      return `${tag.elements?.length || 0} elem`;
    }
    default: {
      return '-';
    }
  }
}

async function load() {
  loading.value = true;
  try {
    const body = await getAdvancedTags();
    config.value = { groups: body?.groups || [] };
    dirty.value = false;
    emit('mutated', config.value);
  } catch (error) {
    ElMessage.error(
      `${$t('scada.advancedTags.loadFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const body = await putAdvancedTags(config.value);
    config.value = { groups: body?.groups || config.value.groups };
    dirty.value = false;
    emit('mutated', config.value);
    ElMessage.success($t('scada.advancedTags.saved'));
  } catch (error) {
    ElMessage.error(
      `${$t('scada.advancedTags.saveFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    saving.value = false;
  }
}

function applyFocusPath(path: string) {
  if (!path) {
    selectedGroupPath.value = '';
    selectedTagId.value = '';
    selectedRow.value = null;
    return;
  }
  const parts = path.split('/').filter(Boolean);
  const groupPath = parts.join('/');
  const asGroup = findGroup(config.value.groups, groupPath);
  if (asGroup) {
    selectedGroupPath.value = groupPath;
    selectedTagId.value = '';
    selectedRow.value = null;
    return;
  }
  const gp = parts.slice(0, -1).join('/');
  const grp = findGroup(config.value.groups, gp);
  if (grp) {
    const tagName = parts[parts.length - 1] || '';
    selectedGroupPath.value = gp;
    const tag = (grp.tags || []).find((t) => t.name === tagName);
    selectedTagId.value = tag?.id || '';
    selectedRow.value = tag || null;
    return;
  }
  selectedGroupPath.value = groupPath;
  selectedTagId.value = '';
  selectedRow.value = null;
}

watch(
  () => props.focusPath,
  (p) => applyFocusPath(p || ''),
  { immediate: true },
);

watch(config, () => {
  if (props.focusPath) applyFocusPath(props.focusPath);
});

function onTreeSelect(data: TreeNode) {
  selectedGroupPath.value = data.path;
  selectedTagId.value = '';
  selectedRow.value = null;
}

function onRowClick(row: AdvancedTagDef) {
  selectedTagId.value = row.id;
  selectedRow.value = row;
}

function openCreate(kind: AdvancedKind) {
  if (!selectedGroupPath.value) {
    ElMessage.warning($t('scada.advancedTags.selectGroupFirst'));
    return;
  }
  dlgKind.value = kind;
  dlgInitial.value = null;
  dlgOpen.value = true;
}

function openEdit(row?: AdvancedTagDef | null) {
  const tag = row || selectedRow.value;
  if (!tag) {
    ElMessage.warning($t('scada.advancedTags.selectTagFirst'));
    return;
  }
  dlgKind.value = tag.kind;
  dlgInitial.value = structuredClone(tag);
  dlgOpen.value = true;
}

function onDialogConfirm(tag: AdvancedTagDef) {
  const g = ensureGroupPath(selectedGroupPath.value);
  if (!g) {
    ElMessage.warning($t('scada.advancedTags.selectGroupFirst'));
    return;
  }
  if (!g.tags) g.tags = [];
  const idx = g.tags.findIndex((t) => t.id === tag.id);
  if (idx === -1) {
    g.tags.push(tag);
  } else {
    g.tags[idx] = tag;
  }
  selectedTagId.value = tag.id;
  selectedRow.value = tag;
  markDirty();
  emit('mutated', config.value);
}

function openNewGroup() {
  groupDlgEditPath.value = '';
  groupDlgName.value = 'Group1';
  groupDlgEnabled.value = true;
  groupDlgOpen.value = true;
}

function openEditGroup() {
  const g = activeGroup.value;
  if (!g) {
    ElMessage.warning($t('scada.advancedTags.selectGroupFirst'));
    return;
  }
  groupDlgEditPath.value = selectedGroupPath.value;
  groupDlgName.value = g.name;
  groupDlgEnabled.value = g.enabled;
  groupDlgOpen.value = true;
}

function confirmGroupDlg() {
  const name = groupDlgName.value.trim();
  if (!name) {
    ElMessage.warning($t('scada.advancedTags.groupNameRequired'));
    return;
  }
  if (groupDlgEditPath.value) {
    const g = findGroup(config.value.groups, groupDlgEditPath.value);
    if (g) {
      g.name = name;
      g.enabled = groupDlgEnabled.value;
      // update path
      const parts = groupDlgEditPath.value.split('/');
      parts[parts.length - 1] = name;
      selectedGroupPath.value = parts.join('/');
    }
  } else {
    const parent = selectedGroupPath.value
      ? ensureGroupPath(selectedGroupPath.value)
      : null;
    const target = parent || null;
    const list = target ? (target.groups ||= []) : config.value.groups;
    if (list.some((g) => g.name === name)) {
      ElMessage.warning($t('scada.advancedTags.groupExists'));
      return;
    }
    list.push({
      name,
      enabled: groupDlgEnabled.value,
      groups: [],
      tags: [],
    });
    selectedGroupPath.value = target
      ? `${selectedGroupPath.value}/${name}`
      : name;
  }
  groupDlgOpen.value = false;
  markDirty();
  emit('mutated', config.value);
}

function setEnabled(enabled: boolean) {
  if (selectedRow.value && selectedGroupPath.value) {
    const g = findGroup(config.value.groups, selectedGroupPath.value);
    const tag = g?.tags?.find((t) => t.id === selectedRow.value?.id);
    if (tag) {
      tag.enabled = enabled;
      selectedRow.value = tag;
      markDirty();
      emit('mutated', config.value);
      return;
    }
  }
  const g = activeGroup.value;
  if (g) {
    g.enabled = enabled;
    markDirty();
    emit('mutated', config.value);
    return;
  }
  ElMessage.warning($t('scada.advancedTags.selectNodeFirst'));
}

async function removeSelected() {
  if (selectedRow.value && selectedGroupPath.value) {
    try {
      await ElMessageBox.confirm(
        $t('scada.advancedTags.confirmDeleteTag', {
          name: selectedRow.value.name,
        }),
        $t('scada.advancedTags.delete'),
        { type: 'warning' },
      );
    } catch {
      return;
    }
    const g = findGroup(config.value.groups, selectedGroupPath.value);
    if (g?.tags) {
      g.tags = g.tags.filter((t) => t.id !== selectedRow.value?.id);
      selectedRow.value = null;
      selectedTagId.value = '';
      markDirty();
      emit('mutated', config.value);
    }
    return;
  }
  if (selectedGroupPath.value) {
    try {
      await ElMessageBox.confirm(
        $t('scada.advancedTags.confirmDeleteGroup', {
          name: selectedGroupPath.value,
        }),
        $t('scada.advancedTags.delete'),
        { type: 'warning' },
      );
    } catch {
      return;
    }
    const parts = selectedGroupPath.value.split('/');
    const name = parts.pop();
    if (!name) return;
    const parentPath = parts.join('/');
    if (parentPath) {
      const parent = findGroup(config.value.groups, parentPath);
      if (parent?.groups) {
        parent.groups = parent.groups.filter((g) => g.name !== name);
      }
    } else {
      config.value.groups = config.value.groups.filter((g) => g.name !== name);
    }
    selectedGroupPath.value = parentPath;
    markDirty();
    emit('mutated', config.value);
  }
}

defineExpose({
  createKind: openCreate,
  createGroup: openNewGroup,
  setEnabled,
  save,
  reload: load,
  removeSelected,
  openEdit,
});

onMounted(() => {
  void load();
});
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col"
    :class="embed ? '' : 'p-4'"
    v-loading="loading"
  >
    <div v-if="!embed" class="mb-3 flex items-center justify-between gap-2">
      <div>
        <h1 class="text-lg font-semibold">
          {{ $t('scada.advancedTags.title') }}
        </h1>
        <p class="text-muted-foreground text-sm">
          {{ $t('scada.advancedTags.desc') }}
        </p>
      </div>
    </div>

    <!-- Context toolbar: New* by kind + Enable/Disable -->
    <div
      class="bg-muted/30 flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5"
    >
      <ElButton size="small" @click="openNewGroup">
        {{ $t('scada.advancedTags.newTagGroup') }}
      </ElButton>
      <ElButton
        v-for="k in KINDS"
        :key="`tb-${k}`"
        size="small"
        :disabled="!selectedGroupPath"
        @click="openCreate(k)"
      >
        {{
          $t('scada.advancedTags.newKind', {
            kind: $t(`scada.advancedTags.kinds.${k}`),
          })
        }}
      </ElButton>

      <span class="bg-border mx-1 h-5 w-px"></span>

      <ElButton
        size="small"
        :disabled="!selectedRow && !activeGroup"
        @click="setEnabled(true)"
      >
        {{ $t('scada.advancedTags.enable') }}
      </ElButton>
      <ElButton
        size="small"
        :disabled="!selectedRow && !activeGroup"
        @click="setEnabled(false)"
      >
        {{ $t('scada.advancedTags.disable') }}
      </ElButton>
      <ElButton size="small" :disabled="!selectedRow" @click="openEdit()">
        {{ $t('scada.advancedTags.properties') }}
      </ElButton>
      <ElButton
        size="small"
        type="danger"
        plain
        :disabled="!selectedRow && !selectedGroupPath"
        @click="removeSelected"
      >
        {{ $t('scada.advancedTags.delete') }}
      </ElButton>

      <span class="bg-border mx-1 h-5 w-px"></span>

      <ElButton size="small" :loading="loading" @click="load">
        {{ $t('scada.advancedTags.refresh') }}
      </ElButton>
      <ElButton
        size="small"
        type="primary"
        :loading="saving"
        :disabled="!dirty"
        @click="save"
      >
        {{ $t('scada.advancedTags.save') }}
        <span v-if="dirty" class="ml-1">*</span>
      </ElButton>
      <ElButton
        v-if="selectedGroupPath"
        size="small"
        text
        @click="openEditGroup"
      >
        {{ $t('scada.advancedTags.groupProps') }}
      </ElButton>
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- Optional tree (standalone page) -->
      <aside v-if="!hideTree" class="w-56 shrink-0 overflow-auto border-r p-2">
        <ElTree
          :data="treeData"
          node-key="path"
          default-expand-all
          highlight-current
          :props="{ label: 'label', children: 'children' }"
          @node-click="onTreeSelect"
        />
      </aside>

      <!-- Middle list (CTagView) -->
      <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          class="text-muted-foreground flex shrink-0 items-center justify-between border-b px-3 py-1.5 text-xs"
        >
          <span>
            {{
              selectedGroupPath
                ? $t('scada.advancedTags.listTitle', {
                    path: selectedGroupPath,
                  })
                : $t('scada.advancedTags.title')
            }}
          </span>
          <span v-if="dirty" class="text-amber-600">
            {{ $t('scada.advancedTags.unsaved') }}
          </span>
        </div>

        <div
          v-if="!selectedGroupPath"
          class="text-muted-foreground p-6 text-sm"
        >
          {{ listHint }}
        </div>

        <ElTable
          v-else
          :data="listRows"
          height="100%"
          size="small"
          highlight-current-row
          class="min-h-0 flex-1"
          :empty-text="listHint"
          @row-click="(row) => onRowClick(row as AdvancedTagDef)"
          @row-dblclick="(row) => openEdit(row as AdvancedTagDef)"
        >
          <ElTableColumn
            prop="name"
            :label="$t('scada.advancedTags.tagName')"
            min-width="140"
          />
          <ElTableColumn
            prop="kind"
            :label="$t('scada.advancedTags.kind')"
            width="120"
          >
            <template #default="{ row }">
              <ElTag size="small">
                {{ $t(`scada.advancedTags.kinds.${row.kind}`) }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn
            prop="enabled"
            :label="$t('scada.advancedTags.enabled')"
            width="90"
          >
            <template #default="{ row }">
              <ElSwitch
                :model-value="(row as AdvancedTagDef).enabled"
                size="small"
                @change="
                  (v: string | number | boolean) => {
                    (row as AdvancedTagDef).enabled = Boolean(v);
                    markDirty();
                    emit('mutated', config);
                  }
                "
              />
            </template>
          </ElTableColumn>
          <ElTableColumn
            :label="$t('scada.advancedTags.summary')"
            min-width="200"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              {{ summaryFor(row as AdvancedTagDef) }}
            </template>
          </ElTableColumn>
        </ElTable>
      </section>
    </div>

    <AdvancedTagDialog
      v-model:open="dlgOpen"
      :kind="dlgKind"
      :initial="dlgInitial"
      @confirm="onDialogConfirm"
    />

    <ElDialog
      v-model="groupDlgOpen"
      :title="
        groupDlgEditPath
          ? $t('scada.advancedTags.groupProps')
          : $t('scada.advancedTags.newTagGroup')
      "
      width="400px"
      append-to-body
    >
      <ElForm label-width="100px">
        <ElFormItem :label="$t('scada.advancedTags.groupName')">
          <ElInput v-model="groupDlgName" />
        </ElFormItem>
        <ElFormItem :label="$t('scada.advancedTags.enabled')">
          <ElSwitch v-model="groupDlgEnabled" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="groupDlgOpen = false">
          {{ $t('scada.advancedTags.cancel') }}
        </ElButton>
        <ElButton type="primary" @click="confirmGroupDlg">
          {{ $t('scada.advancedTags.ok') }}
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>
