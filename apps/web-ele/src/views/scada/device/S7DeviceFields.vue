<script lang="ts" setup>
import type { S7DeviceForm } from './s7DeviceFields';

import { computed } from 'vue';

import { $t } from '@vben/locales';

import {
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSwitch,
} from 'element-plus';

import {
  s7ShowsATGProject,
  s7ShowsMPI,
  s7ShowsRackSlot,
  s7ShowsTSAP,
} from './s7DeviceFields';

const props = defineProps<{
  group: string;
  model: string;
}>();

const form = defineModel<S7DeviceForm>({ required: true });

const showTSAP = computed(() => s7ShowsTSAP(props.model));
const showRack = computed(() => s7ShowsRackSlot(props.model));
const showMPI = computed(() => s7ShowsMPI(props.model));
const showATG = computed(() => s7ShowsATGProject(props.model));

const linkTypes = [
  { value: 'PC', label: 'PC' },
  { value: 'PG', label: 'PG' },
  { value: 'OP', label: 'OP' },
];

const importTypes = [
  { value: 'csv', key: 'tagImportCsv' },
  { value: 's7p', key: 'tagImportS7p' },
  { value: 'tpe', key: 'tagImportTpe' },
];
</script>

<template>
  <div v-show="group === 's7Comm'">
    <ElFormItem :label="$t('scada.device.fields.port')">
      <ElInputNumber
        v-model="form.port"
        :min="0"
        :max="65535"
        class="w-full!"
        controls-position="right"
      />
    </ElFormItem>
    <ElFormItem v-if="showRack" :label="$t('scada.device.fields.linkType')">
      <ElSelect v-model="form.linkType" class="w-full">
        <ElOption
          v-for="o in linkTypes"
          :key="o.value"
          :label="o.label"
          :value="o.value"
        />
      </ElSelect>
    </ElFormItem>
    <ElFormItem v-if="showRack" :label="$t('scada.device.fields.rack')">
      <ElInputNumber
        v-model="form.rack"
        :min="0"
        :max="7"
        class="w-full!"
        controls-position="right"
      />
    </ElFormItem>
    <ElFormItem v-if="showRack" :label="$t('scada.device.fields.slot')">
      <ElInputNumber
        v-model="form.slot"
        :min="1"
        :max="31"
        class="w-full!"
        controls-position="right"
      />
    </ElFormItem>
    <ElFormItem v-if="showTSAP" :label="$t('scada.device.fields.localTsap')">
      <ElInputNumber
        v-model="form.localTsap"
        :min="0"
        :max="65535"
        class="w-full!"
        controls-position="right"
      />
    </ElFormItem>
    <ElFormItem v-if="showTSAP" :label="$t('scada.device.fields.remoteTsap')">
      <ElInputNumber
        v-model="form.remoteTsap"
        :min="0"
        :max="65535"
        class="w-full!"
        controls-position="right"
      />
    </ElFormItem>
    <ElFormItem v-if="showMPI" :label="$t('scada.device.fields.mpiId')">
      <ElInputNumber
        v-model="form.mpiId"
        :min="0"
        :max="126"
        class="w-full!"
        controls-position="right"
      />
    </ElFormItem>
  </div>

  <div v-show="group === 's7Address'">
    <ElFormItem :label="$t('scada.device.fields.littleEndian')">
      <ElSwitch v-model="form.littleEndian" />
    </ElFormItem>
  </div>

  <div v-show="group === 's7Import'">
    <ElFormItem :label="$t('scada.device.fields.tagImportType')">
      <ElSelect v-model="form.tagImportType" class="w-full">
        <ElOption
          v-for="o in importTypes"
          :key="o.value"
          :label="$t(`scada.device.fields.${o.key}`)"
          :value="o.value"
        />
      </ElSelect>
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.importFile')">
      <ElInput v-model="form.importFile" />
    </ElFormItem>
    <template v-if="showATG">
      <ElFormItem :label="$t('scada.device.fields.projectFile')">
        <ElInput v-model="form.projectFile" />
      </ElFormItem>
      <ElFormItem :label="$t('scada.device.fields.programPath')">
        <ElInput v-model="form.programPath" />
      </ElFormItem>
      <ElFormItem :label="$t('scada.device.fields.codePage')">
        <ElInputNumber
          v-model="form.codePage"
          :min="0"
          class="w-full!"
          controls-position="right"
        />
      </ElFormItem>
    </template>
  </div>
</template>
