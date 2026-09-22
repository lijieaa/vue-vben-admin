<script lang="ts" setup>
import type { ModbusDeviceForm } from './modbusDeviceFields';

import type {
  ScadaDeviceInfo,
  ScadaModelInfo,
  SchemaField,
  SchemaOption,
} from '#/api/scada';

import { computed, onMounted, reactive, ref, watch } from 'vue';

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
  ElTag,
} from 'element-plus';

import {
  fetchDeviceSettingsSchema,
  fetchDriver,
  patchChannelDevice,
  scadaErrorMessage,
} from '#/api/scada';

import PropertySheet from '../components/PropertySheet.vue';
import {
  defaultModbusDeviceForm,
  hydrateModbusDeviceForm,
  modbusSettingsPayload,
} from './modbusDeviceFields';
import ModbusDeviceFields from './ModbusDeviceFields.vue';

const props = defineProps<{
  channel: string;
  driver: string;
  device: ScadaDeviceInfo;
}>();

const emit = defineEmits<{
  saved: [info: ScadaDeviceInfo];
}>();

const HOST_GROUPS = [
  'general',
  'operating',
  'scan',
  'timing',
  'demotion',
  'taggen',
] as const;
const MODBUS_GROUPS = [
  'mbComm',
  'mbSettings',
  'mbBlocks',
  'mbImport',
  'mbError',
] as const;

const submitting = ref(false);
const loadingMeta = ref(false);
const models = ref<ScadaModelInfo[]>([]);
const schemaFields = ref<Record<string, SchemaField>>({});

const form = reactive({
  description: '',
  model: 'modbus',
  subModel: 'n_a',
  stationId: 1,
  scanRateMs: 1000,
  timeoutMs: 1000,
  retries: 3,
  enabled: true,
  simulated: false,
  scanMode: 'respect_client',
  scanFloorMs: 0,
  initialUpdateFromCache: false,
  connectTimeoutMs: 3000,
  failAfter: 3,
  interRequestDelayMs: 0,
  demotionEnabled: false,
  demoteAfter: 3,
  demoteForMs: 10_000,
  discardWrites: false,
  onDeviceStartup: 'do_not_generate',
  onPropertyChange: true,
  onDuplicateTag: 'delete_on_create',
  autoTagParentGroup: '',
  autoTagAllowSubgroups: true,
});

const mb = reactive<ModbusDeviceForm>(defaultModbusDeviceForm());
const isModbus = computed(() => props.driver === 'modbus_tcp');
const groupKeys = computed(() =>
  isModbus.value ? [...HOST_GROUPS, ...MODBUS_GROUPS] : [...HOST_GROUPS],
);

const propertyGroupItems = computed(() =>
  groupKeys.value.map((key) => ({
    key,
    label: $t(`scada.device.groups.${key}`),
  })),
);

function optionLabel(_key: string, value: boolean | number | string): string {
  const i18nKey = `scada.options.${value}`;
  const translated = $t(i18nKey);
  if (translated !== i18nKey) return translated;
  return String(value);
}

function enumOptions(fieldKey: string): Array<{ value: any; label: string }> {
  const field = schemaFields.value[fieldKey];
  if (!field?.options?.length) return [];
  return field.options.map((o: SchemaOption) => ({
    value: o.value,
    label: optionLabel(fieldKey, o.value as any),
  }));
}

function asNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asStr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v ? v : fallback;
}

function hydrate(info: ScadaDeviceInfo) {
  const s = (info.settings || {}) as Record<string, any>;
  const dem = (s.auto_demotion || {}) as Record<string, any>;
  form.description = info.description || '';
  form.model = info.model || asStr(s.model, 'modbus');
  form.subModel = asStr(info.sub_model, 'n_a');
  form.stationId = info.station_id ?? 1;
  form.scanRateMs = info.scan_rate_ms ?? 1000;
  form.timeoutMs = info.timeout_ms ?? 1000;
  form.retries = info.retries ?? 3;
  form.enabled = info.enabled ?? asBool(s.enabled, true);
  form.simulated = info.simulated ?? asBool(s.simulated, false);
  form.scanMode = asStr(info.scan_mode || s.scan_mode, 'respect_client');
  form.scanFloorMs = asNum(s.scan_floor_ms, 0);
  form.initialUpdateFromCache = asBool(s.initial_update_from_cache, false);
  form.connectTimeoutMs = asNum(s.connect_timeout_ms, 3000);
  form.failAfter = asNum(s.fail_after, 3);
  form.interRequestDelayMs = asNum(s.inter_request_delay_ms, 0);
  form.demotionEnabled = asBool(dem.enabled, false);
  form.demoteAfter = asNum(dem.demote_after, 3);
  form.demoteForMs = asNum(dem.demote_for_ms, 10_000);
  form.discardWrites = asBool(dem.discard_writes, false);
  form.onDeviceStartup = asStr(s.on_device_startup, 'do_not_generate');
  form.onPropertyChange = asBool(s.on_property_change, true);
  form.onDuplicateTag = asStr(s.on_duplicate_tag, 'delete_on_create');
  form.autoTagParentGroup = asStr(s.auto_tag_parent_group, '');
  form.autoTagAllowSubgroups = asBool(s.auto_tag_allow_subgroups, true);
  Object.assign(mb, hydrateModbusDeviceForm(s));
}

watch(
  () => props.device,
  (d) => {
    if (d) hydrate(d);
  },
  { immediate: true, deep: true },
);

async function loadModels() {
  try {
    const doc = await fetchDriver(props.driver);
    models.value = doc.models ?? [];
  } catch {
    models.value = [];
  }
}

async function loadMeta() {
  loadingMeta.value = true;
  try {
    const [schema] = await Promise.all([
      fetchDeviceSettingsSchema(),
      loadModels(),
    ]);
    schemaFields.value = schema.fields ?? {};
  } catch (error) {
    ElMessage.error(
      `${$t('scada.device.errors.metaFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    loadingMeta.value = false;
  }
}

watch(
  () => props.driver,
  () => {
    void loadModels();
  },
);

function validate(): null | string {
  if (form.failAfter < 1 || form.failAfter > 30) {
    return $t('scada.device.errors.failAfterInvalid');
  }
  if (form.demoteForMs < 100 || form.demoteForMs > 3_600_000) {
    return $t('scada.device.errors.demoteForInvalid');
  }
  return null;
}

async function onSave() {
  const err = validate();
  if (err) {
    ElMessage.warning(err);
    return;
  }
  submitting.value = true;
  try {
    const info = await patchChannelDevice(props.channel, props.device.name, {
      description: form.description.trim(),
      model: form.model,
      sub_model: isModbus.value ? form.subModel : undefined,
      station_id: form.stationId,
      scan_rate_ms: form.scanRateMs,
      timeout_ms: form.timeoutMs,
      retries: form.retries,
      enabled: form.enabled,
      settings: {
        enabled: form.enabled,
        simulated: form.simulated,
        scan_mode: form.scanMode,
        scan_floor_ms: form.scanFloorMs,
        initial_update_from_cache: form.initialUpdateFromCache,
        connect_timeout_ms: form.connectTimeoutMs,
        fail_after: form.failAfter,
        inter_request_delay_ms: form.interRequestDelayMs,
        on_device_startup: form.onDeviceStartup,
        on_property_change: form.onPropertyChange,
        on_duplicate_tag: form.onDuplicateTag,
        auto_tag_parent_group: form.autoTagParentGroup,
        auto_tag_allow_subgroups: form.autoTagAllowSubgroups,
        auto_demotion: {
          enabled: form.demotionEnabled,
          demote_after: form.demoteAfter,
          demote_for_ms: form.demoteForMs,
          discard_writes: form.discardWrites,
        },
        ...(isModbus.value ? modbusSettingsPayload(mb) : {}),
      },
    });
    ElMessage.success($t('scada.device.success.patched'));
    emit('saved', info);
  } catch (error) {
    ElMessage.error(
      `${$t('scada.device.errors.patchFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadMeta();
});
</script>

<template>
  <div v-loading="loadingMeta">
    <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <span class="text-muted-foreground">{{ $t('scada.device.fields.status') }}:</span>
      <ElTag
        size="small"
        :type="device.status === 'online' ? 'success' : 'info'"
      >
        {{ device.status || '-' }}
      </ElTag>
      <span v-if="device.error" class="text-red-500">{{ device.error }}</span>
      <span class="text-muted-foreground ml-auto">
        {{ $t('scada.device.fields.tagCount') }}: {{ device.tag_count ?? 0 }}
      </span>
    </div>

    <ElForm label-position="left" label-width="120px" class="inspector-form">
      <PropertySheet :groups="propertyGroupItems">
        <template #general>
          <ElFormItem :label="$t('scada.device.fields.name')">
            <ElInput :model-value="device.name" disabled />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.description')">
            <ElInput v-model="form.description" type="textarea" :rows="2" />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.channel')">
            <ElInput :model-value="channel" disabled />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.driver')">
            <ElInput :model-value="driver" disabled />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.model')">
            <ElSelect
              v-model="form.model"
              class="w-full"
              filterable
              allow-create
            >
              <ElOption
                v-for="m in models"
                :key="m.id"
                :label="m.name"
                :value="m.id"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem
            v-if="isModbus"
            :label="$t('scada.device.fields.subModel')"
          >
            <ElSelect v-model="form.subModel" class="w-full">
              <ElOption value="n_a" :label="$t('scada.device.fields.subNa')" />
              <ElOption
                value="generic_modbus"
                :label="$t('scada.device.fields.subGeneric')"
              />
              <ElOption
                value="tsx_premium"
                :label="$t('scada.device.fields.subTsxPremium')"
              />
              <ElOption
                value="tsx_quantum"
                :label="$t('scada.device.fields.subTsxQuantum')"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.stationId')">
            <ElInputNumber
              v-model="form.stationId"
              :min="0"
              class="w-full!"
              controls-position="right"
            />
          </ElFormItem>
        </template>

        <template #operating>
          <ElFormItem :label="$t('scada.device.fields.enabled')">
            <ElSwitch v-model="form.enabled" />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.simulated')">
            <ElSwitch v-model="form.simulated" />
          </ElFormItem>
        </template>

        <template #scan>
          <ElFormItem :label="$t('scada.device.fields.scanMode')">
            <ElSelect v-model="form.scanMode" class="w-full">
              <ElOption
                v-for="o in enumOptions('scan_mode')"
                :key="String(o.value)"
                :label="o.label"
                :value="o.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.scanRate')">
            <ElInputNumber
              v-model="form.scanRateMs"
              :min="10"
              class="w-full!"
              controls-position="right"
            />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.scanFloor')">
            <ElInputNumber
              v-model="form.scanFloorMs"
              :min="0"
              class="w-full!"
              controls-position="right"
            />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.initialFromCache')">
            <ElSwitch v-model="form.initialUpdateFromCache" />
          </ElFormItem>
        </template>

        <template #timing>
          <ElFormItem :label="$t('scada.device.fields.connectTimeout')">
            <ElInputNumber
              v-model="form.connectTimeoutMs"
              :min="0"
              class="w-full!"
              controls-position="right"
            />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.timeout')">
            <ElInputNumber
              v-model="form.timeoutMs"
              :min="50"
              class="w-full!"
              controls-position="right"
            />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.retries')">
            <ElInputNumber
              v-model="form.retries"
              :min="0"
              :max="30"
              class="w-full!"
              controls-position="right"
            />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.failAfter')">
            <ElInputNumber
              v-model="form.failAfter"
              :min="1"
              :max="30"
              class="w-full!"
              controls-position="right"
            />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.interRequestDelay')">
            <ElInputNumber
              v-model="form.interRequestDelayMs"
              :min="0"
              class="w-full!"
              controls-position="right"
            />
          </ElFormItem>
        </template>

        <template #demotion>
          <ElFormItem :label="$t('scada.device.fields.demotionEnabled')">
            <ElSwitch v-model="form.demotionEnabled" />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.demoteAfter')">
            <ElInputNumber
              v-model="form.demoteAfter"
              :min="1"
              :max="30"
              class="w-full!"
              controls-position="right"
            />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.demoteFor')">
            <ElInputNumber
              v-model="form.demoteForMs"
              :min="100"
              :max="3600000"
              class="w-full!"
              controls-position="right"
            />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.discardWrites')">
            <ElSwitch v-model="form.discardWrites" />
          </ElFormItem>
        </template>

        <template #taggen>
          <ElFormItem :label="$t('scada.device.fields.onDeviceStartup')">
            <ElSelect v-model="form.onDeviceStartup" class="w-full">
              <ElOption
                v-for="o in enumOptions('on_device_startup')"
                :key="String(o.value)"
                :label="o.label"
                :value="o.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.onPropertyChange')">
            <ElSwitch v-model="form.onPropertyChange" />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.onDuplicateTag')">
            <ElSelect v-model="form.onDuplicateTag" class="w-full">
              <ElOption
                v-for="o in enumOptions('on_duplicate_tag')"
                :key="String(o.value)"
                :label="o.label"
                :value="o.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.autoTagParentGroup')">
            <ElInput v-model="form.autoTagParentGroup" maxlength="256" />
          </ElFormItem>
          <ElFormItem :label="$t('scada.device.fields.autoTagAllowSubgroups')">
            <ElSwitch v-model="form.autoTagAllowSubgroups" />
          </ElFormItem>
        </template>

        <template v-if="isModbus" #mbComm>
          <ModbusDeviceFields v-model="mb" group="mbComm" />
        </template>
        <template v-if="isModbus" #mbSettings>
          <ModbusDeviceFields v-model="mb" group="mbSettings" />
        </template>
        <template v-if="isModbus" #mbBlocks>
          <ModbusDeviceFields v-model="mb" group="mbBlocks" />
        </template>
        <template v-if="isModbus" #mbImport>
          <ModbusDeviceFields v-model="mb" group="mbImport" />
        </template>
        <template v-if="isModbus" #mbError>
          <ModbusDeviceFields v-model="mb" group="mbError" />
        </template>
      </PropertySheet>
    </ElForm>

    <div
      class="sticky bottom-0 mt-4 flex justify-end bg-background/95 py-2 backdrop-blur"
    >
      <ElButton
        type="primary"
        size="small"
        :loading="submitting"
        @click="onSave"
      >
        {{ $t('scada.device.save') }}
      </ElButton>
    </div>
  </div>
</template>
