import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:factory',
      order: 10,
      title: $t('scada.menu.scada'),
    },
    name: 'Scada',
    path: '/scada',
    redirect: '/scada/workspace',
    children: [
      {
        name: 'ScadaWorkspace',
        path: 'workspace',
        component: () => import('#/views/scada/workspace/index.vue'),
        meta: {
          affixTab: true,
          icon: 'lucide:panel-left',
          title: $t('scada.menu.workspace'),
        },
      },
      {
        name: 'ScadaChannelCreate',
        path: 'channel/create',
        component: () => import('#/views/scada/channel/create.vue'),
        meta: {
          hideInMenu: true,
          icon: 'lucide:cable',
          title: $t('scada.menu.channelCreate'),
        },
      },
      {
        name: 'ScadaAlarms',
        path: 'alarms',
        component: () => import('#/views/scada/alarms/index.vue'),
        meta: {
          icon: 'lucide:bell',
          title: $t('scada.menu.alarms'),
        },
      },
    ],
  },
];

export default routes;
