<script lang="ts" setup>
import type { ScadaAddressHint, ScadaTag } from '#/api/scada';

import { computed, reactive, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import {
  ElAutocomplete,
  ElButton,
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
  createDeviceTag,
  fetchDriverAddressHelp,
  patchDeviceTag,
  scadaErrorMessage,
} from '#/api/scada';

import PropertySheet from '../components/PropertySheet.vue';

const props = withDefaults(
  defineProps<{
    channel: string;
    device: string;
    /** Driver name used to load the address dropdown. */
    driver?: string;
    /** When set, dialog edits an existing tag (PATCH). */
    editName?: string;
    initial?: Partial<ScadaTag>;
    showCancel?: boolean;
    /** Right-dock inspector layout. */
    embed?: boolean;
  }>(),
  {
    driver: '',
    editName: '',
    initial: () => ({}),
    showCancel: true,
    embed: false,
  },
);

const emit = defineEmits<{
  submit: [name: string];
  cancel: [];
}>();

const submitting = ref(false);
const tagGroups = computed(() => [
  { key: 'general', label: $t('scada.tag.sections.identification') },
  { key: 'data', label: $t('scada.tag.sections.data') },
  { key: 'scaling', label: $t('scada.tag.sections.scaling') },
]);

const form = reactive({
  name: '',
  description: '',
  address: '',
  dataType: 'Default',
  access: 'RW',
  respectClientType: false,
  scanRateMs: 0,
  group: '',
  scaleEnabled: false,
  scaleType: 'linear',
  rawLow: 0,
  rawHigh: 1000,
  engLow: 0,
  engHigh: 100,
  clamp: false,
  negate: false,
  units: '',
});

const isEdit = computed(() => !!props.editName);

const dataTypeValues = [
  'Default',
  'Boolean',
  'Char',
  'Byte',
  'Short',
  'Word',
  'Long',
  'DWord',
  'Float',
  'Double',
  'String',
  'BCD',
  'LBCD',
];

const legacyDataType: Record<string, string> = {
  DEFAULT: 'Default',
  BOOL: 'Boolean',
  BOOLEAN: 'Boolean',
  BIT: 'Boolean',
  CHAR: 'Char',
  BYTE: 'Byte',
  SHORT: 'Short',
  INT16: 'Short',
  INT: 'Short',
  WORD: 'Word',
  UINT16: 'Word',
  UINT: 'Word',
  LONG: 'Long',
  INT32: 'Long',
  DINT: 'Long',
  DWORD: 'DWord',
  UINT32: 'DWord',
  UDINT: 'DWord',
  FLOAT: 'Float',
  REAL: 'Float',
  SINGLE: 'Float',
  DOUBLE: 'Double',
  LREAL: 'Double',
  STRING: 'String',
  BCD: 'BCD',
  LBCD: 'LBCD',
};

function canonicalDataType(raw?: string) {
  const text = (raw || '').trim();
  if (!text) return 'Default';
  return legacyDataType[text.toUpperCase()] || text;
}

function dataTypeLabel(value: string) {
  if (!dataTypeValues.includes(value)) return value;
  return $t(`scada.tag.dataTypes.${value}`);
}

const dataTypeOptions = computed(() => {
  const values = [...dataTypeValues];
  if (form.dataType && !values.includes(form.dataType)) {
    values.push(form.dataType);
  }
  return values;
});

const addressHints = ref<ScadaAddressHint[]>([]);

async function loadAddressHints() {
  if (!props.driver) {
    addressHints.value = [];
    return;
  }
  try {
    const help = await fetchDriverAddressHelp(props.driver);
    if (help.hints?.length) {
      addressHints.value = help.hints;
      return;
    }
    addressHints.value = (help.examples || []).map((example) => ({
      text: example,
      example,
    }));
  } catch {
    addressHints.value = [];
  }
}

function filterAddressHints(
  query: string,
  done: (items: Array<ScadaAddressHint & { value: string }>) => void,
) {
  const q = query.trim().toLowerCase();
  let matched = addressHints.value.filter((hint) => {
    if (!q) return true;
    return (
      hint.text.toLowerCase().includes(q) ||
      hint.example.toLowerCase().includes(q)
    );
  });
  // Imported / free-form addresses (e.g. "48212") match no catalog row —
  // still offer the full dialect list so the picker does not look "missing".
  if (matched.length === 0) {
    matched = addressHints.value;
  }
  done(matched.map((hint) => ({ ...hint, value: hint.example })));
}

function onAddressHint(item: Record<string, any>) {
  const example = typeof item.example === 'string' ? item.example : '';
  const value = typeof item.value === 'string' ? item.value : '';
  form.address = example || value;
  if (typeof item.data_type === 'string' && item.data_type) {
    form.dataType = canonicalDataType(item.data_type);
  }
}

const accessOptions = [
  { value: 'R', labelKey: 'scada.options.access_r' },
  { value: 'W', labelKey: 'scada.options.access_w' },
  { value: 'RW', labelKey: 'scada.options.access_rw' },
];

const scaleTypeOptions = [
  { value: 'linear', labelKey: 'scada.options.scale_linear' },
  { value: 'square_root', labelKey: 'scada.options.scale_square_root' },
];

function applyInitial() {
  const i = props.initial || {};
  form.name = i.name || props.editName || '';
  form.description = i.description || '';
  form.address = i.address || '';
  form.dataType = canonicalDataType(i.data_type);
  form.access = i.access || 'RW';
  form.respectClientType = !!i.respect_client_type;
  form.scanRateMs = i.scan_rate_ms ?? 0;
  form.group = i.group || '';
  const sc = i.scaling;
  form.scaleEnabled = !!(sc?.enabled || (sc?.type && sc.type !== 'none'));
  form.scaleType = sc?.type && sc.type !== 'none' ? sc.type : 'linear';
  form.rawLow = sc?.raw_low ?? 0;
  form.rawHigh = sc?.raw_high ?? 1000;
  form.engLow = sc?.eng_low ?? 0;
  form.engHigh = sc?.eng_high ?? 100;
  form.clamp = !!sc?.clamp;
  form.negate = !!sc?.negate;
  form.units = sc?.units || '';
}

watch(
  () => [props.editName, props.initial],
  () => applyInitial(),
  { immediate: true, deep: true },
);

watch(
  () => props.driver,
  () => {
    void loadAddressHints();
  },
  { immediate: true },
);

const payload = computed<ScadaTag>(() => {
  const body: ScadaTag = {
    name: form.name.trim(),
    address: form.address.trim(),
    data_type: form.dataType,
    access: form.access,
    description: form.description.trim() || undefined,
    respect_client_type: form.respectClientType,
    scan_rate_ms: form.scanRateMs > 0 ? form.scanRateMs : undefined,
  };
  if (form.group.trim()) body.group = form.group.trim();
  body.scaling = form.scaleEnabled
    ? {
        enabled: true,
        type: form.scaleType,
        raw_low: form.rawLow,
        raw_high: form.rawHigh,
        eng_low: form.engLow,
        eng_high: form.engHigh,
        clamp: form.clamp,
        negate: form.negate,
        units: form.units.trim() || undefined,
      }
    : { enabled: false, type: 'none' };
  return body;
});

async function onSubmit() {
  if (!form.name.trim()) {
    ElMessage.warning($t('scada.tag.errors.nameRequired'));
    return;
  }
  if (!form.address.trim()) {
    ElMessage.warning($t('scada.tag.errors.addressRequired'));
    return;
  }
  submitting.value = true;
  try {
    if (isEdit.value) {
      const { name: _n, group: _g, ...patch } = payload.value;
      await patchDeviceTag(props.channel, props.device, props.editName, patch);
      ElMessage.success($t('scada.tag.success.updated'));
      emit('submit', props.editName);
    } else {
      const res = await createDeviceTag(
        props.channel,
        props.device,
        payload.value,
      );
      ElMessage.success(
        `${$t('scada.tag.success.created')}: ${res.name || form.name}`,
      );
      emit('submit', res.name || form.name);
    }
  } catch (error) {
    ElMessage.error(
      `${isEdit.value ? $t('scada.tag.errors.updateFailed') : $t('scada.tag.errors.createFailed')}: ${scadaErrorMessage(error)}`,
    );
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <ElForm
      label-position="left"
      label-width="120px"
      :class="embed ? undefined : 'max-h-[70vh] overflow-y-auto pr-2'"
    >
      <PropertySheet :groups="tagGroups">
        <template #general>
          <ElFormItem :label="$t('scada.tag.fields.name')" required>
            <ElInput
              v-model="form.name"
              maxlength="256"
              :disabled="isEdit"
              show-word-limit
            />
          </ElFormItem>
          <ElFormItem :label="$t('scada.tag.fields.description')">
            <ElInput v-model="form.description" type="textarea" :rows="2" />
          </ElFormItem>
          <ElFormItem :label="$t('scada.tag.fields.group')">
            <ElInput
              v-model="form.group"
              :placeholder="$t('scada.tag.hints.group')"
              :disabled="isEdit"
            />
          </ElFormItem>
        </template>

        <template #data>
          <ElFormItem :label="$t('scada.tag.fields.address')" required>
            <ElAutocomplete
              v-model="form.address"
              class="w-full"
              :fetch-suggestions="filterAddressHints"
              :trigger-on-focus="true"
              :highlight-first-item="false"
              :placeholder="$t('scada.tag.hints.address')"
              @select="onAddressHint"
            >
              <template #default="{ item }">
                <span>{{ item.text }}</span>
              </template>
            </ElAutocomplete>
          </ElFormItem>
          <ElFormItem :label="$t('scada.tag.fields.dataType')">
            <ElSelect v-model="form.dataType" class="w-full">
              <ElOption
                v-for="t in dataTypeOptions"
                :key="t"
                :label="dataTypeLabel(t)"
                :value="t"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem :label="$t('scada.tag.fields.access')">
            <ElSelect v-model="form.access" class="w-full">
              <ElOption
                v-for="o in accessOptions"
                :key="o.value"
                :label="$t(o.labelKey)"
                :value="o.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem :label="$t('scada.tag.fields.respectType')">
            <ElSwitch v-model="form.respectClientType" />
          </ElFormItem>
          <ElFormItem :label="$t('scada.tag.fields.scanRate')">
            <ElInputNumber
              v-model="form.scanRateMs"
              :min="0"
              class="w-full!"
              controls-position="right"
            />
            <p class="text-muted-foreground mt-1 text-xs">
              {{ $t('scada.tag.hints.scanRate') }}
            </p>
          </ElFormItem>
        </template>

        <template #scaling>
          <ElFormItem :label="$t('scada.tag.fields.scaleEnabled')">
            <ElSwitch v-model="form.scaleEnabled" />
          </ElFormItem>
          <template v-if="form.scaleEnabled">
            <ElFormItem :label="$t('scada.tag.fields.scaleType')">
              <ElSelect v-model="form.scaleType" class="w-full">
                <ElOption
                  v-for="o in scaleTypeOptions"
                  :key="o.value"
                  :label="$t(o.labelKey)"
                  :value="o.value"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem :label="$t('scada.tag.fields.rawLow')">
              <ElInputNumber
                v-model="form.rawLow"
                class="w-full!"
                controls-position="right"
              />
            </ElFormItem>
            <ElFormItem :label="$t('scada.tag.fields.rawHigh')">
              <ElInputNumber
                v-model="form.rawHigh"
                class="w-full!"
                controls-position="right"
              />
            </ElFormItem>
            <ElFormItem :label="$t('scada.tag.fields.engLow')">
              <ElInputNumber
                v-model="form.engLow"
                class="w-full!"
                controls-position="right"
              />
            </ElFormItem>
            <ElFormItem :label="$t('scada.tag.fields.engHigh')">
              <ElInputNumber
                v-model="form.engHigh"
                class="w-full!"
                controls-position="right"
              />
            </ElFormItem>
            <ElFormItem :label="$t('scada.tag.fields.clamp')">
              <ElSwitch v-model="form.clamp" />
            </ElFormItem>
            <ElFormItem :label="$t('scada.tag.fields.negate')">
              <ElSwitch v-model="form.negate" />
            </ElFormItem>
            <ElFormItem :label="$t('scada.tag.fields.units')">
              <ElInput v-model="form.units" />
            </ElFormItem>
          </template>
        </template>
      </PropertySheet>
    </ElForm>

    <div
      class="flex justify-end gap-2"
      :class="
        embed ? 'sticky bottom-0 bg-background/95 py-2 backdrop-blur' : 'mt-4'
      "
    >
      <ElButton v-if="showCancel" size="small" @click="emit('cancel')">
        {{ $t('scada.tag.cancel') }}
      </ElButton>
      <ElButton
        type="primary"
        size="small"
        :loading="submitting"
        @click="onSubmit"
      >
        {{ isEdit ? $t('scada.tag.save') : $t('scada.tag.create') }}
      </ElButton>
    </div>
  </div>
</template>
