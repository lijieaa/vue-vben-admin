import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:factory',
      order: 10,
      title: 'SCADA',
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
          title: '工作台',
        },
      },
    ],
  },
];

export default routes;
