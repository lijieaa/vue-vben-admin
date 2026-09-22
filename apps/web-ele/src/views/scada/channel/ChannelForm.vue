<script lang="ts" setup>
import type {
  ScadaChannelCreateBody,
  ScadaChannelInfo,
  ScadaDriverInfo,
  ScadaNetworkAdapter,
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
  createChannel,
  fetchChannelSettingsSchema,
  fetchDriverChannelSettingsSchema,
  fetchDrivers,
  fetchNetworkAdapters,
  patchChannel,
  scadaErrorMessage,
} from '#/api/scada';

import CreateWizardShell from '../components/CreateWizardShell.vue';
import PropertySheet from '../components/PropertySheet.vue';

export type ChannelPayload = ScadaChannelCreateBody;

const props = withDefaults(
  defineProps<{
    showPreview?: boolean;
    mode?: 'create' | 'edit';
    initial?: null | ScadaChannelInfo;
    /** Right-dock inspector: bare PropertySheet + Save (no wizard card). */
    embed?: boolean;
  }>(),
  { showPreview: true, mode: 'create', initial: null, embed: false },
);

const emit = defineEmits<{
  submit: [payload: ChannelPayload];
  saved: [];
}>();

/**
 * Top-level wizard pages (aligned with industrial config wizard):
 * 1 Select type -> 2 Name -> 3 Property sheet -> 4 Summary.
 * Step 3 uses Godot-style vertical property groups.
 */
const STEP_KEYS = ['type', 'name', 'props', 'summary'] as const;
type StepKey = (typeof STEP_KEYS)[number];

/** Property groups shown inside the props sheet (servermain Group= / driver custom). */
const GROUP_KEYS = [
  'general',
  'ethernet',
  'write',
  'advanced',
  'serialization',
  'diagnostics',
  'modbus',
] as const;
type GroupKey = (typeof GROUP_KEYS)[number];

const stepIndex = ref(0);
const loadingMeta = ref(false);
const metaReady = ref(false);
const submitting = ref(false);

const drivers = ref<ScadaDriverInfo[]>([]);
const networkAdapters = ref<ScadaNetworkAdapter[]>([]);
const writeOptValues = ref<Array<boolean | number | string>>([]);
const floatValues = ref<Array<boolean | number | string>>([]);
const virtualNetworkValues = ref<Array<boolean | number | string>>([]);

const form = reactive({
  id: '',
  name: '',
  description: '',
  driver: 'modbus_tcp',
  diagnosticsEnabled: false,
  networkAdapter: 'default',
  host: '127.0.0.1',
  port: 502,
  writeOptimization: 'write_last_value_only',
  maxConsecutiveWrites: 10,
  floatHandling: 'unmodified',
  interDeviceDelayMs: 0,
  virtualNetwork: 0 as number,
  transactionsPerCycle: 1,
  useMultipleSockets: true,
  maxSocketsPerDevice: 5,
  globalUnsolicitedPort: 502,
  globalUnsolicitedProtocol: 'tcp',
});

const isEdit = computed(() => props.mode === 'edit');
const currentStep = computed(() =>
  isEdit.value ? 'props' : (STEP_KEYS[stepIndex.value] as StepKey),
);
const isLast = computed(() => stepIndex.value === STEP_KEYS.length - 1);
const isModbusDriver = computed(() => form.driver === 'modbus_tcp');

const virtualNetworkEnabled = computed(() => Number(form.virtualNetwork) > 0);
const maxSocketsDisabled = computed(
  () => !form.useMultipleSockets || virtualNetworkEnabled.value,
);

function optionLabel(value: boolean | number | string): string {
  if (value === false) return $t('scada.options.socket_shared');
  if (value === true) return $t('scada.options.socket_per_device');
  if (value === 0 || value === '0') return $t('scada.options.none');
  if (typeof value === 'number' && value >= 1 && value <= 50) {
    return $t('scada.options.network', { n: value });
  }
  const key = String(value);
  const known = [
    'write_all_values',
    'write_last_value_only',
    'write_last_non_boolean_only',
    'unmodified',
    'replace_with_zero',
    'tcp',
    'udp',
  ];
  if (known.includes(key)) return $t(`scada.options.${key}`);
  return key;
}

const writeOptOptions = computed(() =>
  writeOptValues.value.map((value) => ({ value, label: optionLabel(value) })),
);
const floatOptions = computed(() =>
  floatValues.value.map((value) => ({ value, label: optionLabel(value) })),
);
const virtualNetworkOptions = computed(() =>
  virtualNetworkValues.value.map((value) => ({
    value,
    label: optionLabel(value),
  })),
);
const socketUtilOptions = computed(() => [
  { value: false, label: optionLabel(false) },
  { value: true, label: optionLabel(true) },
]);
const protocolOptions = computed(() => [
  { value: 'tcp', label: optionLabel('tcp') },
  { value: 'udp', label: optionLabel('udp') },
]);

const stepTitle = (key: StepKey) => $t(`scada.channel.steps.${key}`);
const groupTitle = (key: GroupKey) => $t(`scada.channel.groups.${key}`);

function groupSkipped(key: GroupKey): boolean {
  if (key === 'modbus' && !isModbusDriver.value) return true;
  if (key === 'ethernet' && form.driver === 'simulator') return true;
  return false;
}

const visibleGroups = computed(() =>
  GROUP_KEYS.filter((key) => !groupSkipped(key)),
);

const wizardSteps = computed(() =>
  STEP_KEYS.map((key) => ({ key, title: stepTitle(key) })),
);

const propertyGroupItems = computed(() =>
  visibleGroups.value.map((key) => ({ key, label: groupTitle(key) })),
);

watch(
  () => form.virtualNetwork,
  (vn) => {
    if (Number(vn) > 0) {
      form.useMultipleSockets = false;
    }
  },
);

watch(
  () => form.driver,
  async (driver) => {
    if (!driver) return;
    await loadDriverSchema(driver);
  },
);

const payload = computed<ChannelPayload>(() => ({
  id: form.id.trim() || form.name.trim(),
  name: form.name.trim(),
  description: form.description.trim(),
  driver: form.driver,
  medium: {
    kind: form.driver === 'simulator' ? 'none' : 'ethernet',
    host: form.host.trim(),
    port: form.port,
  },
  settings: {
    write_optimization: form.writeOptimization,
    max_consecutive_writes: form.maxConsecutiveWrites,
    inter_device_delay_ms: form.interDeviceDelayMs,
    float_handling: form.floatHandling,
    network_adapter: form.networkAdapter,
    diagnostics_enabled: form.diagnosticsEnabled,
    virtual_network: Number(form.virtualNetwork),
    transactions_per_cycle: form.transactionsPerCycle,
    ...(isModbusDriver.value
      ? {
          use_multiple_sockets: form.useMultipleSockets,
          max_sockets_per_device: form.maxSocketsPerDevice,
          global_unsolicited_port: form.globalUnsolicitedPort,
          global_unsolicited_protocol: form.globalUnsolicitedProtocol,
        }
      : {}),
  },
  devices: [],
}));

const previewJson = computed(() => JSON.stringify(payload.value, null, 2));

function valuesFromField(
  field?: SchemaField,
): Array<boolean | number | string> {
  if (!field) return [];
  if (field.options?.length) {
    return field.options.map((o: SchemaOption) => o.value);
  }
  const range = field.options_from_range;
  if (!range) return [];
  const start = range.start ?? 1;
  const end = range.end ?? 1;
  const out: Array<boolean | number | string> = [];
  if (range.zero_label !== undefined && range.zero_label !== null) {
    out.push(0);
  }
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function applyFieldDefault(
  field: SchemaField | undefined,
  key: keyof typeof form,
) {
  if (!field || field.default === undefined) return;
  (form as any)[key] = field.default;
}

function adapterLabel(a: ScadaNetworkAdapter): string {
  if (a.value === 'default') return $t('scada.options.adapter_default');
  return a.ip ? `${a.name} (${a.ip})` : a.name;
}

async function loadDriverSchema(driver: string) {
  if (isEdit.value) return;
  try {
    const doc = await fetchDriverChannelSettingsSchema(driver);
    const fields = doc.fields ?? {};
    applyFieldDefault(fields.use_multiple_sockets, 'useMultipleSockets');
    applyFieldDefault(fields.max_sockets_per_device, 'maxSocketsPerDevice');
    applyFieldDefault(fields.global_unsolicited_port, 'globalUnsolicitedPort');
    applyFieldDefault(
      fields.global_unsolicited_protocol,
      'globalUnsolicitedProtocol',
    );
  } catch {
    // keep defaults
  }
}

async function loadMeta() {
  loadingMeta.value = true;
  try {
    const [driverList, adapters, common] = await Promise.all([
      fetchDrivers(),
      fetchNetworkAdapters(),
      fetchChannelSettingsSchema(),
    ]);
    drivers.value = driverList ?? [];
    networkAdapters.value = adapters?.length
      ? adapters
      : [{ value: 'default', ip: '', name: 'Default' }];

    const fields = common.fields ?? {};
    writeOptValues.value = valuesFromField(fields.write_optimization);
    floatValues.value = valuesFromField(fields.float_handling);
    virtualNetworkValues.value = valuesFromField(fields.virtual_network);

    if (!isEdit.value) {
      applyFieldDefault(fields.write_optimization, 'writeOptimization');
      applyFieldDefault(fields.max_consecutive_writes, 'maxConsecutiveWrites');
      applyFieldDefault(fields.float_handling, 'floatHandling');
      applyFieldDefault(fields.inter_device_delay_ms, 'interDeviceDelayMs');
      applyFieldDefault(fields.network_adapter, 'networkAdapter');
      applyFieldDefault(fields.diagnostics_enabled, 'diagnosticsEnabled');
      applyFieldDefault(fields.virtual_network, 'virtualNetwork');
      applyFieldDefault(fields.transactions_per_cycle, 'transactionsPerCycle');

      if (
        drivers.value.length > 0 &&
        !drivers.value.some((d) => d.name === form.driver)
      ) {
        const first = drivers.value[0];
        if (first) form.driver = first.name;
      }
      await loadDriverSchema(form.driver);
    }
    metaReady.value = true;
    if (isEdit.value) applyInitial(props.initial);
  } catch (error) {
    ElMessage.error(
      `${$t('scada.channel.errors.metaFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    loadingMeta.value = false;
  }
}

function validateStep(key: StepKey): null | string {
  switch (key) {
    case 'type': {
      if (!form.driver) return $t('scada.channel.errors.driverRequired');
      return null;
    }
    case 'name': {
      if (!form.name.trim()) return $t('scada.channel.errors.nameRequired');
      return null;
    }
    case 'props': {
      if (form.driver !== 'simulator') {
        if (!form.host.trim()) return $t('scada.channel.errors.hostRequired');
        if (form.port < 1 || form.port > 65_535) {
          return $t('scada.channel.errors.portInvalid');
        }
      }
      if (form.maxConsecutiveWrites < 1 || form.maxConsecutiveWrites > 10) {
        return $t('scada.channel.errors.dutyInvalid');
      }
      if (form.transactionsPerCycle < 1 || form.transactionsPerCycle > 99) {
        return $t('scada.channel.errors.txnInvalid');
      }
      return null;
    }
    default: {
      return null;
    }
  }
}

function onNext() {
  if (isEdit.value) {
    void onSaveEdit();
    return;
  }
  const err = validateStep(currentStep.value);
  if (err) {
    ElMessage.warning(err);
    return;
  }
  if (isLast.value) {
    void onSubmit();
    return;
  }
  stepIndex.value += 1;
}

function onPrev() {
  stepIndex.value = Math.max(0, stepIndex.value - 1);
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
    const body = payload.value;
    const res = await createChannel(body);
    ElMessage.success(
      `${$t('scada.channel.success.created')}: ${res.name || body.name}`,
    );
    emit('submit', body);
  } catch (error) {
    ElMessage.error(
      `${$t('scada.channel.errors.createFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    submitting.value = false;
  }
}

function onReset() {
  form.id = '';
  form.name = '';
  form.description = '';
  form.diagnosticsEnabled = false;
  form.networkAdapter = 'default';
  form.host = '127.0.0.1';
  form.port = 502;
  form.writeOptimization = 'write_last_value_only';
  form.maxConsecutiveWrites = 10;
  form.floatHandling = 'unmodified';
  form.interDeviceDelayMs = 0;
  form.virtualNetwork = 0;
  form.transactionsPerCycle = 1;
  form.useMultipleSockets = true;
  form.maxSocketsPerDevice = 5;
  form.globalUnsolicitedPort = 502;
  form.globalUnsolicitedProtocol = 'tcp';
  stepIndex.value = 0;
}

function pickStr(value: unknown, fallback: string) {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function pickNum(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function pickBool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function applyInitial(info: null | ScadaChannelInfo | undefined) {
  if (!info) return;
  form.name = info.name || '';
  form.driver = info.driver || form.driver;
  form.description = info.description ?? '';
  form.host =
    info.medium?.host ?? (form.driver === 'simulator' ? '' : form.host);
  form.port = pickNum(
    info.medium?.port,
    form.driver === 'simulator' ? 0 : form.port,
  );
  const settings = info.settings ?? {};
  form.diagnosticsEnabled = pickBool(
    settings.diagnostics_enabled,
    form.diagnosticsEnabled,
  );
  form.networkAdapter = pickStr(settings.network_adapter, form.networkAdapter);
  form.writeOptimization = pickStr(
    settings.write_optimization,
    form.writeOptimization,
  );
  form.maxConsecutiveWrites = pickNum(
    settings.max_consecutive_writes,
    form.maxConsecutiveWrites,
  );
  form.floatHandling = pickStr(settings.float_handling, form.floatHandling);
  form.interDeviceDelayMs = pickNum(
    settings.inter_device_delay_ms,
    form.interDeviceDelayMs,
  );
  form.virtualNetwork = pickNum(settings.virtual_network, form.virtualNetwork);
  form.transactionsPerCycle = pickNum(
    settings.transactions_per_cycle,
    form.transactionsPerCycle,
  );
  form.useMultipleSockets = pickBool(
    settings.use_multiple_sockets,
    form.useMultipleSockets,
  );
  form.maxSocketsPerDevice = pickNum(
    settings.max_sockets_per_device,
    form.maxSocketsPerDevice,
  );
  form.globalUnsolicitedPort = pickNum(
    settings.global_unsolicited_port,
    form.globalUnsolicitedPort,
  );
  form.globalUnsolicitedProtocol = pickStr(
    settings.global_unsolicited_protocol,
    form.globalUnsolicitedProtocol,
  );
}

async function onSaveEdit() {
  const err = validateStep('props');
  if (err) {
    ElMessage.warning(err);
    return;
  }
  submitting.value = true;
  try {
    const body = payload.value;
    await patchChannel(form.name.trim(), {
      description: body.description ?? '',
      medium: body.medium,
      settings: body.settings ?? {},
    });
    ElMessage.success($t('scada.channel.success.updated'));
    emit('saved');
  } catch (error) {
    ElMessage.error(
      `${$t('scada.channel.errors.updateFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    submitting.value = false;
  }
}

watch(
  () => props.initial,
  (info) => {
    if (isEdit.value && metaReady.value) applyInitial(info);
  },
);

onMounted(() => {
  void loadMeta();
});

defineExpose({ payload, onSubmit, onReset, loadMeta });
</script>

<template>
  <CreateWizardShell
    :title="isEdit ? $t('scada.channel.detail') : $t('scada.channel.props')"
    :steps="wizardSteps"
    :step-index="stepIndex"
    :submitting="submitting"
    :loading="loadingMeta"
    :show-preview="props.showPreview && !isEdit"
    :edit-mode="isEdit"
    :bare="isEdit && props.embed"
    @prev="onPrev"
    @next="onNext"
    @reset="onReset"
  >
    <ElForm
      label-position="left"
      :label-width="isEdit && props.embed ? '120px' : '160px'"
      class="min-h-[280px]"
    >
      <div v-show="currentStep === 'type'" class="max-w-xl">
        <p class="text-muted-foreground mb-3 text-sm">
          {{ $t('scada.channel.hints.typeHint') }}
        </p>
        <ElFormItem :label="$t('scada.channel.fields.driver')" required>
          <ElSelect v-model="form.driver" class="w-full" filterable>
            <ElOption
              v-for="d in drivers"
              :key="d.name"
              :label="d.friendly_name || d.name"
              :value="d.name"
            />
          </ElSelect>
        </ElFormItem>
      </div>

      <div v-show="currentStep === 'name'" class="grid max-w-xl gap-3">
        <p class="text-muted-foreground text-sm">
          {{ $t('scada.channel.hints.nameHint') }}
        </p>
        <ElFormItem :label="$t('scada.channel.fields.name')" required>
          <ElInput v-model="form.name" maxlength="256" show-word-limit />
        </ElFormItem>
        <ElFormItem :label="$t('scada.channel.fields.id')">
          <ElInput
            v-model="form.id"
            :placeholder="$t('scada.channel.hints.idPlaceholder')"
          />
        </ElFormItem>
      </div>

      <div v-show="currentStep === 'props'">
        <PropertySheet :groups="propertyGroupItems">
          <template #general>
            <div class="text-muted-foreground mb-2 text-xs">
              {{ $t('scada.channel.sections.identification') }}
            </div>
            <ElFormItem :label="$t('scada.channel.fields.name')">
              <ElInput :model-value="form.name" disabled />
            </ElFormItem>
            <ElFormItem :label="$t('scada.channel.fields.description')">
              <ElInput
                v-model="form.description"
                type="textarea"
                :rows="2"
                :placeholder="$t('scada.channel.hints.descPlaceholder')"
              />
            </ElFormItem>
            <ElFormItem :label="$t('scada.channel.fields.driver')">
              <ElInput
                :model-value="
                  drivers.find((d) => d.name === form.driver)?.friendly_name ||
                  form.driver
                "
                disabled
              />
            </ElFormItem>
          </template>

          <template #ethernet>
            <div class="text-muted-foreground mb-2 text-xs">
              {{ $t('scada.channel.sections.ethernetSettings') }}
            </div>
            <ElFormItem :label="$t('scada.channel.fields.networkAdapter')">
              <ElSelect v-model="form.networkAdapter" class="w-full" filterable>
                <ElOption
                  v-for="o in networkAdapters"
                  :key="o.value"
                  :label="adapterLabel(o)"
                  :value="o.value"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem :label="$t('scada.channel.fields.host')" required>
              <ElInput v-model="form.host" placeholder="127.0.0.1" />
            </ElFormItem>
            <ElFormItem :label="$t('scada.channel.fields.port')" required>
              <ElInputNumber
                v-model="form.port"
                :min="1"
                :max="65535"
                class="w-full!"
                controls-position="right"
              />
            </ElFormItem>
            <p class="text-muted-foreground text-xs">
              {{ $t('scada.channel.hints.mediumHint') }}
            </p>
          </template>

          <template #write>
            <p class="text-muted-foreground mb-2 text-xs">
              {{ $t('scada.channel.hints.dutyHint') }}
            </p>
            <ElFormItem :label="$t('scada.channel.fields.writeOptimization')">
              <ElSelect v-model="form.writeOptimization" class="w-full">
                <ElOption
                  v-for="o in writeOptOptions"
                  :key="String(o.value)"
                  :label="o.label"
                  :value="o.value"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem :label="$t('scada.channel.fields.dutyCycle')">
              <ElInputNumber
                v-model="form.maxConsecutiveWrites"
                :min="1"
                :max="10"
                class="w-full!"
                controls-position="right"
              />
            </ElFormItem>
          </template>

          <template #advanced>
            <ElFormItem :label="$t('scada.channel.fields.floatHandling')">
              <ElSelect v-model="form.floatHandling" class="w-full">
                <ElOption
                  v-for="o in floatOptions"
                  :key="String(o.value)"
                  :label="o.label"
                  :value="o.value"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem :label="$t('scada.channel.fields.interDeviceDelay')">
              <ElInputNumber
                v-model="form.interDeviceDelayMs"
                :min="0"
                class="w-full!"
                controls-position="right"
              />
            </ElFormItem>
          </template>

          <template #serialization>
            <div class="text-muted-foreground mb-2 text-xs">
              {{ $t('scada.channel.sections.channelLevel') }}
            </div>
            <ElFormItem :label="$t('scada.channel.fields.virtualNetwork')">
              <ElSelect v-model="form.virtualNetwork" class="w-full" filterable>
                <ElOption
                  v-for="o in virtualNetworkOptions"
                  :key="String(o.value)"
                  :label="o.label"
                  :value="o.value"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem
              :label="$t('scada.channel.fields.transactionsPerCycle')"
            >
              <ElInputNumber
                v-model="form.transactionsPerCycle"
                :min="1"
                :max="99"
                :disabled="!virtualNetworkEnabled"
                class="w-full!"
                controls-position="right"
              />
            </ElFormItem>
            <p class="text-muted-foreground text-xs">
              {{ $t('scada.channel.hints.networkMode') }}
            </p>
          </template>

          <template #diagnostics>
            <div class="text-muted-foreground mb-2 text-xs">
              {{ $t('scada.channel.sections.diagnostics') }}
            </div>
            <p class="text-muted-foreground mb-2 text-xs">
              {{ $t('scada.channel.hints.diagnosticsHint') }}
            </p>
            <ElFormItem :label="$t('scada.channel.fields.diagnostics')">
              <ElSwitch v-model="form.diagnosticsEnabled" />
            </ElFormItem>
          </template>

          <template #modbus>
            <div class="mb-2 text-xs font-medium">
              {{ $t('scada.channel.sections.sockets') }}
            </div>
            <ElFormItem :label="$t('scada.channel.fields.socketUtilization')">
              <ElSelect
                v-model="form.useMultipleSockets"
                class="w-full"
                :disabled="virtualNetworkEnabled"
              >
                <ElOption
                  v-for="o in socketUtilOptions"
                  :key="String(o.value)"
                  :label="o.label"
                  :value="o.value"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem :label="$t('scada.channel.fields.maxSockets')">
              <ElInputNumber
                v-model="form.maxSocketsPerDevice"
                :min="1"
                :max="10"
                :disabled="maxSocketsDisabled"
                class="w-full!"
                controls-position="right"
              />
            </ElFormItem>
            <div class="mb-2 mt-3 text-xs font-medium">
              {{ $t('scada.channel.sections.unsolicited') }}
            </div>
            <ElFormItem :label="$t('scada.channel.fields.unsolicitedPort')">
              <ElInputNumber
                v-model="form.globalUnsolicitedPort"
                :min="0"
                :max="65535"
                class="w-full!"
                controls-position="right"
              />
            </ElFormItem>
            <ElFormItem :label="$t('scada.channel.fields.unsolicitedProtocol')">
              <ElSelect v-model="form.globalUnsolicitedProtocol" class="w-full">
                <ElOption
                  v-for="o in protocolOptions"
                  :key="String(o.value)"
                  :label="o.label"
                  :value="o.value"
                />
              </ElSelect>
            </ElFormItem>
          </template>
        </PropertySheet>
      </div>

      <div v-show="currentStep === 'summary'" class="max-w-2xl">
        <p class="text-muted-foreground mb-3 text-sm">
          {{ $t('scada.channel.hints.summaryHint') }}
        </p>
        <ElDescriptions :column="2" border size="small">
          <ElDescriptionsItem :label="$t('scada.channel.fields.name')">
            {{ form.name }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.channel.fields.driver')">
            {{ form.driver }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.channel.fields.host')">
            {{ form.host }}:{{ form.port }}
          </ElDescriptionsItem>
          <ElDescriptionsItem
            :label="$t('scada.channel.fields.networkAdapter')"
          >
            {{ form.networkAdapter }}
          </ElDescriptionsItem>
          <ElDescriptionsItem
            :label="$t('scada.channel.fields.writeOptimization')"
          >
            {{ optionLabel(form.writeOptimization) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem
            :label="$t('scada.channel.fields.virtualNetwork')"
          >
            {{ optionLabel(form.virtualNetwork) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('scada.channel.fields.diagnostics')">
            {{ form.diagnosticsEnabled ? 'ON' : 'OFF' }}
          </ElDescriptionsItem>
          <ElDescriptionsItem
            v-if="isModbusDriver"
            :label="$t('scada.channel.fields.socketUtilization')"
          >
            {{ optionLabel(form.useMultipleSockets) }}
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
