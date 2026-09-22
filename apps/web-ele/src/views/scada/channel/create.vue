<script lang="ts" setup>
import type { ChannelPayload } from './ChannelForm.vue';

import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { ElButton, ElMessage } from 'element-plus';

import ChannelForm from './ChannelForm.vue';

const router = useRouter();

function onSubmit(payload: ChannelPayload) {
  ElMessage.success(`${$t('scada.channel.success.created')}: ${payload.name}`);
  router.push({ name: 'ScadaWorkspace' });
}

function goBack() {
  router.push({ name: 'ScadaWorkspace' });
}
</script>

<template>
  <Page
    :description="$t('scada.channel.desc')"
    :title="$t('scada.channel.title')"
  >
    <template #extra>
      <ElButton @click="goBack">{{ $t('scada.channel.back') }}</ElButton>
    </template>
    <ChannelForm @submit="onSubmit" />
  </Page>
</template>
