<script lang="ts" setup>
import type { ModbusDeviceForm } from './modbusDeviceFields';

import type {
  ScadaDeviceCreateBody,
  ScadaModelInfo,
  SchemaField,
  SchemaOption,
} from '#/api/scada';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import {
  ElDescriptions,
  ElDescriptionsItem,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
} from 'element-plus';

import {
  createChannelDevice,
  fetchDeviceSettingsSchema,
  fetchDriver,
  scadaErrorMessage,
} from '#/api/scada';

import CreateWizardShell from '../components/CreateWizardShell.vue';
import PropertySheet from '../components/PropertySheet.vue';
import {
  defaultModbusDeviceForm,
  modbusSettingsPayload,
} from './modbusDeviceFields';
import ModbusDeviceFields from './ModbusDeviceFields.vue';

const props = defineProps<{
  channel: string;
  driver: string;
}>();

const emit = defineEmits<{
  submit: [name: string];
}>();

const STEP_KEYS = ['parent', 'name', 'props', 'summary'] as const;
type StepKey = (typeof STEP_KEYS)[number];

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

const stepIndex = ref(0);
const submitting = ref(false);
const loadingMeta = ref(false);
const models = ref<ScadaModelInfo[]>([]);
const schemaFields = ref<Record<string, SchemaField>>({});
const mb = reactive<ModbusDeviceForm>(defaultModbusDeviceForm());

const isModbus = computed(() => props.driver === 'modbus_tcp');
const groupKeys = computed(() =>
  isModbus.value ? [...HOST_GROUPS, ...MODBUS_GROUPS] : [...HOST_GROUPS],
);

const form = reactive({
  id: '',
  name: '',
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

const currentStep = computed(() => STEP_KEYS[stepIndex.value] as StepKey);

const wizardSteps = computed(() =>
  STEP_KEYS.map((key) => ({
    key,
    title: $t(`scada.device.steps.${key}`),
  })),
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

function applyDefaults(fields: Record<string, SchemaField>) {
  const set = (key: string, target: keyof typeof form) => {
    const f = fields[key];
    if (f?.default !== undefined) (form as any)[target] = f.default;
  };
  set('enabled', 'enabled');
  set('simulated', 'simulated');
  set('scan_mode', 'scanMode');
  set('scan_floor_ms', 'scanFloorMs');
  set('initial_update_from_cache', 'initialUpdateFromCache');
  set('connect_timeout_ms', 'connectTimeoutMs');
  set('fail_after', 'failAfter');
  set('inter_request_delay_ms', 'interRequestDelayMs');
  set('auto_demotion.enabled', 'demotionEnabled');
  set('auto_demotion.demote_after', 'demoteAfter');
  set('auto_demotion.demote_for_ms', 'demoteForMs');
  set('auto_demotion.discard_writes', 'discardWrites');
  set('on_device_startup', 'onDeviceStartup');
  set('on_property_change', 'onPropertyChange');
  set('on_duplicate_tag', 'onDuplicateTag');
  set('auto_tag_parent_group', 'autoTagParentGroup');
  set('auto_tag_allow_subgroups', 'autoTagAllowSubgroups');
}

const payload = computed<ScadaDeviceCreateBody>(() => ({
  id: form.id.trim() || form.name.trim(),
  name: form.name.trim(),
  description: form.description.trim() || undefined,
  model: form.model || undefined,
  sub_model: isModbus.value ? form.subModel : undefined,
  station_id: form.stationId,
  scan_rate_ms: form.scanRateMs,
  timeout_ms: form.timeoutMs,
  retries: form.retries,
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
  tags: [],
}));

const previewJson = computed(() => JSON.stringify(payload.value, null, 2));

async function loadModels() {
  try {
    const doc = await fetchDriver(props.driver);
    models.value = doc.models ?? [];
    if (
      models.value.length > 0 &&
      !models.value.some((m) => m.id === form.model)
    ) {
      const first = models.value[0];
      if (first) form.model = first.id;
    }
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
    applyDefaults(schemaFields.value);
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

function validateStep(key: StepKey): null | string {
  if (key === 'name' && !form.name.trim()) {
    return $t('scada.device.errors.nameRequired');
  }
  if (key === 'props') {
    if (form.failAfter < 1 || form.failAfter > 30) {
      return $t('scada.device.errors.failAfterInvalid');
    }
    if (form.demoteForMs < 100 || form.demoteForMs > 3_600_000) {
      return $t('scada.device.errors.demoteForInvalid');
    }
  }
  return null;
}

function onNext() {
  const err = validateStep(currentStep.value);
  if (err) {
    ElMessage.warning(err);
    return;
  }
  if (stepIndex.value >= STEP_KEYS.length - 1) {
    void onSubmit();
    return;
  }
  stepIndex.value += 1;
}

function onPrev() {
  stepIndex.value = Math.max(0, stepIndex.value - 1);
}

function onReset() {
  form.id = '';
  form.name = '';
  form.description = '';
  form.subModel = 'n_a';
  form.stationId = 1;
  form.scanRateMs = 1000;
  form.timeoutMs = 1000;
  form.retries = 3;
  Object.assign(mb, defaultModbusDeviceForm());
  applyDefaults(schemaFields.value);
  stepIndex.value = 0;
}

async function onSubmit() {
  for (const key of STEP_KEYS) {
    const err = validateStep(key);
    if (err) {
      ElMessage.warning(err);
      stepIndex.value = STEP_KEYS.indexOf(key);
      return;
    }
  }
  submitting.value = true;
  try {
    const res = await createChannelDevice(props.channel, payload.value);
    ElMessage.success(
      `${$t('scada.device.success.created')}: ${res.device || form.name}`,
    );
    emit('submit', res.device || form.name);
  } catch (error) {
    ElMessage.error(
      `${$t('scada.device.errors.createFailed')}: ${scadaErrorMessage(error)}`,
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
  <CreateWizardShell
    :title="$t('scada.device.create')"
    :steps="wizardSteps"
    :step-index="stepIndex"
    :submitting="submitting"
    :loading="loadingMeta"
    :show-preview="true"
    @prev="onPrev"
    @next="onNext"
    @reset="onReset"
  >
    <ElForm label-position="left" label-width="120px" class="min-h-[280px]">
      <div v-show="currentStep === 'parent'" class="max-w-xl">
        <p class="text-muted-foreground mb-3 text-sm">
          {{ $t('scada.device.hints.parentHint') }}
        </p>
        <ElFormItem :label="$t('scada.device.fields.channel')">
          <ElInput :model-value="channel" disabled />
        </ElFormItem>
        <ElFormItem :label="$t('scada.device.fields.driver')">
          <ElInput :model-value="driver" disabled />
        </ElFormItem>
      </div>

      <div v-show="currentStep === 'name'" class="max-w-xl">
        <ElFormItem :label="$t('scada.device.fields.name')" required>
          <ElInput v-model="form.name" maxlength="256" show-word-limit />
        </ElFormItem>
        <ElFormItem :label="$t('scada.device.fields.id')">
          <ElInput
            v-model="form.id"
            :placeholder="$t('scada.device.hints.id')"
          />
        </ElFormItem>
      </div>

      <div v-show="currentStep === 'props'">
        <PropertySheet :groups="propertyGroupItems">
          <template #general>
            <ElFormItem :label="$t('scada.device.fields.name')">
              <ElInput :model-value="form.name" disabled />
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
                <ElOption
                  value="n_a"
                  :label="$t('scada.device.fields.subNa')"
                />
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
            <ElFormItem
              :label="$t('scada.device.fields.autoTagAllowSubgroups')"
            >
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
      </div>

      <div v-show="currentStep === 'summary'" class="max-w-2xl">
        <ElDescriptions :column="2" border size="small">
          <ElDescriptionsItem :label="$t('scada.device.fields.name')">
            {{ form.name }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.device.fields.channel')">
            {{ channel }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.device.fields.model')">
            {{ form.model }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.device.fields.stationId')">
            {{ form.stationId }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.device.fields.scanMode')">
            {{ optionLabel('scan_mode', form.scanMode) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.device.fields.enabled')">
            {{ form.enabled ? 'ON' : 'OFF' }}
          </ElDescriptionsItem>
        </ElDescriptions>
      </div>
    </ElForm>

    <template #preview>
      <pre
        class="bg-muted max-h-[560px] overflow-auto rounded-md p-3 text-xs leading-relaxed"
        >{{ previewJson }}</pre>
    </template>
  </CreateWizardShell>
</template>
