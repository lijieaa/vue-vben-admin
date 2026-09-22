<script lang="ts" setup>
import { computed, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Badge,
  Button,
  Descriptions,
  Input,
  Space,
  Tag,
  Tree,
} from 'ant-design-vue';

type TreeKind = 'channel' | 'device' | 'root';
type ListKind = 'channel' | 'device' | 'tag';

interface TreeNode {
  key: string;
  title: string;
  kind: TreeKind;
  channel?: string;
  device?: string;
  driver?: string;
  children?: TreeNode[];
}

interface ListRow {
  id: string;
  kind: ListKind;
  name: string;
  channel?: string;
  device?: string;
  col2: string;
  col3: string;
  col4: string;
}

const filterText = ref('');
const treeSelectedKeys = ref<string[]>(['root']);
const listSelectedId = ref<null | string>(null);

const treeData: TreeNode[] = [
  {
    key: 'root',
    title: 'Runtime Project',
    kind: 'root',
    children: [
      {
        key: 'ch-modbus',
        title: 'Modbus TCP',
        kind: 'channel',
        channel: 'Modbus TCP',
        driver: 'modbus_tcp',
        children: [
          {
            key: 'dev-plc1',
            title: 'PLC_Line1',
            kind: 'device',
            channel: 'Modbus TCP',
            device: 'PLC_Line1',
            driver: 'modbus_tcp',
          },
          {
            key: 'dev-meter',
            title: 'Energy_Meter',
            kind: 'device',
            channel: 'Modbus TCP',
            device: 'Energy_Meter',
            driver: 'modbus_tcp',
          },
        ],
      },
      {
        key: 'ch-s7',
        title: 'Siemens S7',
        kind: 'channel',
        channel: 'Siemens S7',
        driver: 'siemens_s7',
        children: [
          {
            key: 'dev-s7',
            title: 'S7_1500_A',
            kind: 'device',
            channel: 'Siemens S7',
            device: 'S7_1500_A',
            driver: 'siemens_s7',
          },
        ],
      },
    ],
  },
];

const TAGS: Record<string, ListRow[]> = {
  'dev-plc1': [
    {
      id: 'tag-temp',
      kind: 'tag',
      name: 'Temp_SP',
      channel: 'Modbus TCP',
      device: 'PLC_Line1',
      col2: '40001',
      col3: 'FLOAT',
      col4: 'RW',
    },
    {
      id: 'tag-speed',
      kind: 'tag',
      name: 'Motor_RPM',
      channel: 'Modbus TCP',
      device: 'PLC_Line1',
      col2: '40010',
      col3: 'FLOAT',
      col4: 'RW',
    },
    {
      id: 'tag-run',
      kind: 'tag',
      name: 'Run_Cmd',
      channel: 'Modbus TCP',
      device: 'PLC_Line1',
      col2: '00001',
      col3: 'BOOL',
      col4: 'RW',
    },
  ],
  'dev-meter': [
    {
      id: 'tag-kw',
      kind: 'tag',
      name: 'Active_Power',
      channel: 'Modbus TCP',
      device: 'Energy_Meter',
      col2: '30001',
      col3: 'FLOAT',
      col4: 'R',
    },
  ],
  'dev-s7': [
    {
      id: 'tag-db1',
      kind: 'tag',
      name: 'DB1.DBW20',
      channel: 'Siemens S7',
      device: 'S7_1500_A',
      col2: 'DB1.DBW20',
      col3: 'FLOAT',
      col4: 'RW',
    },
  ],
};

function findNode(nodes: TreeNode[], key: string): TreeNode | undefined {
  for (const n of nodes) {
    if (n.key === key) return n;
    if (n.children) {
      const hit = findNode(n.children, key);
      if (hit) return hit;
    }
  }
  return undefined;
}

function filterNodes(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes;
  const lower = q.toLowerCase();
  const walk = (list: TreeNode[]): TreeNode[] =>
    list
      .map((n) => {
        const kids = n.children ? walk(n.children) : undefined;
        if (
          n.title.toLowerCase().includes(lower) ||
          (kids && kids.length > 0)
        ) {
          return { ...n, children: kids };
        }
        return null;
      })
      .filter(Boolean) as TreeNode[];
  return walk(nodes);
}

const filteredTree = computed(() =>
  filterNodes(treeData, filterText.value.trim()),
);

const treeNode = computed(() => {
  const found = findNode(treeData, treeSelectedKeys.value[0] || 'root');
  return found ?? treeData[0] ?? null;
});

const listRows = computed<ListRow[]>(() => {
  const n = treeNode.value;
  if (!n) return [];
  if (n.kind === 'root') {
    return (n.children ?? []).map((ch) => ({
      id: ch.key,
      kind: 'channel' as const,
      name: ch.title,
      channel: ch.channel,
      col2: ch.driver || '-',
      col3: 'started',
      col4: String(ch.children?.length ?? 0),
    }));
  }
  if (n.kind === 'channel') {
    return (n.children ?? []).map((d) => ({
      id: d.key,
      kind: 'device' as const,
      name: d.title,
      channel: d.channel,
      device: d.device,
      col2: d.driver || '-',
      col3: '1',
      col4: '1000',
    }));
  }
  return TAGS[n.key] ?? [];
});

const listColumns = computed(() => {
  const n = treeNode.value;
  if (!n || n.kind === 'root') {
    return {
      title: '通道列表',
      c1: '名称',
      c2: '驱动',
      c3: '状态',
      c4: '设备数',
    };
  }
  if (n.kind === 'channel') {
    return {
      title: '设备列表',
      c1: '名称',
      c2: '型号',
      c3: '站号',
      c4: '扫描率',
    };
  }
  return {
    title: '标签列表',
    c1: '名称',
    c2: '地址',
    c3: '类型',
    c4: '访问',
  };
});

const listSelected = computed(
  () => listRows.value.find((r) => r.id === listSelectedId.value) ?? null,
);

const propsFocus = computed(() => {
  if (listSelected.value) return listSelected.value;
  const n = treeNode.value;
  if (!n || n.kind === 'root') return null;
  return {
    id: n.key,
    kind: n.kind as ListKind,
    name: n.title,
    channel: n.channel,
    device: n.device,
    col2: n.driver || '-',
    col3: '-',
    col4: '-',
  };
});

const propsItems = computed(() => {
  const f = propsFocus.value;
  if (!f) {
    return [
      { label: '工程', value: 'Runtime Project' },
      { label: '通道数', value: '2' },
      { label: '说明', value: '在左侧选通道/设备，或在上方列表选一行' },
    ];
  }
  if (f.kind === 'channel') {
    return [
      { label: '名称', value: f.name },
      { label: '驱动', value: f.col2 },
      { label: '状态', value: f.col3 },
      { label: '设备数', value: f.col4 },
    ];
  }
  if (f.kind === 'device') {
    return [
      { label: '名称', value: f.name },
      { label: '通道', value: f.channel || '-' },
      { label: '站号', value: f.col3 },
      { label: '扫描率', value: `${f.col4} ms` },
      { label: '状态', value: 'online' },
    ];
  }
  return [
    { label: '名称', value: f.name },
    { label: '地址', value: f.col2 },
    { label: '类型', value: f.col3 },
    { label: '访问', value: f.col4 },
    { label: '设备', value: f.device || '-' },
  ];
});

function onTreeSelect(keys: (number | string)[]) {
  if (keys.length === 0) return;
  treeSelectedKeys.value = keys.map(String);
  listSelectedId.value = null;
}

function onListSelect(row: ListRow) {
  listSelectedId.value = row.id;
}
</script>

<template>
  <Page
    auto-content-height
    content-class="flex h-full min-h-0 flex-col overflow-hidden !p-0"
    title="SCADA 工作台"
    description="工程树 | 对象列表 / 属性表（mock 壳，对齐参考配置客户端）"
  >
    <template #extra>
      <Space wrap>
        <Button type="primary" size="small">新建通道</Button>
        <Button size="small">新建设备</Button>
        <Button size="small">新建标签</Button>
        <Badge status="processing" text="Runtime 已连接" />
        <Tag color="blue">mock</Tag>
      </Space>
    </template>

    <div class="flex h-full min-h-0 flex-1 overflow-hidden border-t">
      <aside class="bg-muted/20 flex w-64 shrink-0 flex-col border-r">
        <div
          class="border-b px-3 py-2 text-xs font-semibold tracking-wide uppercase opacity-70"
        >
          工程树
        </div>
        <div class="shrink-0 p-2">
          <Input.Search
            v-model:value="filterText"
            allow-clear
            placeholder="筛选..."
            size="small"
          />
        </div>
        <div class="min-h-0 flex-1 overflow-auto px-2 pb-2">
          <Tree
            v-model:selected-keys="treeSelectedKeys"
            :tree-data="filteredTree"
            default-expand-all
            block-node
            @select="onTreeSelect"
          />
        </div>
      </aside>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <section class="flex h-[38%] min-h-[140px] shrink-0 flex-col border-b">
          <div
            class="bg-muted/30 flex shrink-0 items-center border-b px-3 py-2 text-sm font-medium"
          >
            {{ listColumns.title }}
          </div>
          <div class="min-h-0 flex-1 overflow-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-muted/20 sticky top-0 text-xs opacity-70">
                <tr>
                  <th class="px-3 py-2 font-medium">{{ listColumns.c1 }}</th>
                  <th class="px-3 py-2 font-medium">{{ listColumns.c2 }}</th>
                  <th class="px-3 py-2 font-medium">{{ listColumns.c3 }}</th>
                  <th class="px-3 py-2 font-medium">{{ listColumns.c4 }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in listRows"
                  :key="row.id"
                  class="hover:bg-muted/40 cursor-pointer border-t"
                  :class="
                    listSelectedId === row.id ? 'bg-primary/10' : undefined
                  "
                  @click="onListSelect(row)"
                >
                  <td class="px-3 py-2 font-medium">{{ row.name }}</td>
                  <td class="text-muted-foreground px-3 py-2">
                    {{ row.col2 }}
                  </td>
                  <td class="text-muted-foreground px-3 py-2">
                    {{ row.col3 }}
                  </td>
                  <td class="text-muted-foreground px-3 py-2">
                    {{ row.col4 }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            class="bg-muted/30 flex shrink-0 items-center border-b px-3 py-2 text-sm font-medium"
          >
            属性表
            <span
              v-if="propsFocus"
              class="text-muted-foreground ml-2 font-normal"
            >
              · {{ propsFocus.name }}
            </span>
          </div>
          <div class="min-h-0 flex-1 overflow-auto p-3">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item
                v-for="item in propsItems"
                :key="item.label"
                :label="item.label"
              >
                {{ item.value }}
              </Descriptions.Item>
            </Descriptions>
            <p class="text-muted-foreground mt-3 text-xs">
              树选父对象 → 上表列子对象；点上表行 → 下表编辑该对象（mock）。
            </p>
          </div>
        </section>
      </div>
    </div>
  </Page>
</template>
