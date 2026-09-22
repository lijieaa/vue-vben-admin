<script lang="ts" setup>
import type { ModbusDeviceForm } from './modbusDeviceFields';

import { $t } from '@vben/locales';

import {
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSwitch,
} from 'element-plus';

defineProps<{
  group: string;
}>();

const form = defineModel<ModbusDeviceForm>({ required: true });

const protocols = [
  { value: 'tcp', label: 'TCP/IP' },
  { value: 'udp', label: 'UDP' },
];

const privileges = [
  { value: 'read_only', key: 'privilege_read_only' },
  { value: 'device_writes', key: 'privilege_device_writes' },
  { value: 'memory_map_writes', key: 'privilege_memory_map_writes' },
];
</script>

<template>
  <div v-show="group === 'mbComm'">
    <ElFormItem :label="$t('scada.device.fields.port')">
      <ElInputNumber
        v-model="form.port"
        :min="0"
        :max="65535"
        class="w-full!"
        controls-position="right"
      />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.protocol')">
      <ElSelect v-model="form.protocol" class="w-full">
        <ElOption
          v-for="o in protocols"
          :key="o.value"
          :label="o.label"
          :value="o.value"
        />
      </ElSelect>
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.closeSocketOnTimeout')">
      <ElSwitch v-model="form.closeTcpSocketOnTimeout" />
    </ElFormItem>
  </div>

  <div v-show="group === 'mbSettings'">
    <ElFormItem :label="$t('scada.device.fields.zeroBased')">
      <ElSwitch v-model="form.zeroBasedAddressing" />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.zeroBasedBits')">
      <ElSwitch v-model="form.zeroBasedBitAddressingRegisters" />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.bitMaskWrites')">
      <ElSwitch v-model="form.holdingRegisterBitMaskWrites" />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.fc06')">
      <ElSwitch v-model="form.modbusFunction06" />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.fc05')">
      <ElSwitch v-model="form.modbusFunction05" />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.clientPrivileges')">
      <ElSelect v-model="form.clientPrivileges" class="w-full">
        <ElOption
          v-for="o in privileges"
          :key="o.value"
          :label="$t(`scada.device.fields.${o.key}`)"
          :value="o.value"
        />
      </ElSelect>
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.byteOrder')">
      <ElSwitch v-model="form.defaultModbusByteOrder" />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.firstWordLow')">
      <ElSwitch v-model="form.firstWordLow32" />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.firstDwordLow')">
      <ElSwitch v-model="form.firstDwordLow64" />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.modiconBitOrder')">
      <ElSwitch v-model="form.modiconBitOrdering" />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.longsAsDouble')">
      <ElSwitch v-model="form.longsAsDouble" />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.cegExtension')">
      <ElSwitch v-model="form.cegExtension" />
    </ElFormItem>
  </div>

  <div v-show="group === 'mbBlocks'">
    <ElFormItem :label="$t('scada.device.fields.blockOutput')">
      <ElInputNumber
        v-model="form.blockOutput"
        :min="8"
        :max="8000"
        :step="8"
        class="w-full!"
        controls-position="right"
      />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.blockInput')">
      <ElInputNumber
        v-model="form.blockInput"
        :min="8"
        :max="8000"
        :step="8"
        class="w-full!"
        controls-position="right"
      />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.blockInternal')">
      <ElInputNumber
        v-model="form.blockInternal"
        :min="1"
        :max="500"
        class="w-full!"
        controls-position="right"
      />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.blockHolding')">
      <ElInputNumber
        v-model="form.blockHolding"
        :min="1"
        :max="500"
        class="w-full!"
        controls-position="right"
      />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.blockStringRead')">
      <ElSwitch v-model="form.performBlockStringRead" />
    </ElFormItem>
  </div>

  <div v-show="group === 'mbImport'">
    <ElFormItem :label="$t('scada.device.fields.importFile')">
      <ElInput v-model="form.variableImportFile" maxlength="256" />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.displayDescriptions')">
      <ElSwitch v-model="form.displayDescriptions" />
    </ElFormItem>
  </div>

  <div v-show="group === 'mbError'">
    <ElFormItem :label="$t('scada.device.fields.deviceTimeoutSec')">
      <ElInputNumber
        v-model="form.timeoutSec"
        :min="0"
        :max="64800"
        class="w-full!"
        controls-position="right"
      />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.dataBadUntilWrite')">
      <ElSwitch v-model="form.dataBadUntilWrite" />
    </ElFormItem>
    <ElFormItem :label="$t('scada.device.fields.deactivateIllegal')">
      <ElSwitch v-model="form.deactivateOnIllegalAddress" />
    </ElFormItem>
  </div>
</template>
