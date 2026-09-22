import { defineConfig, viteCssLayerPlugin } from '@vben/vite-config';

import ElementPlus from 'unplugin-element-plus/vite';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      plugins: [
        // element-plus 的 css 包进 @layer el，使 Tailwind 工具类可覆盖组件样式
        viteCssLayerPlugin({ layerName: 'el', packageName: 'element-plus' }),
        ElementPlus({ format: 'esm' }),
      ],
      server: {
        proxy: {
          '/api': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
            // mock代理目标地址
            target: 'http://localhost:5320/api',
            ws: true,
          },
          // scada-engine management API (default -http :8080)
          '/scada-api': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/scada-api/, ''),
            target: 'http://localhost:8080',
            ws: true,
          },
          // Optional same-origin proxy; prefer VITE_SCADA_MQTT_URL direct WS in .env.development
          '/mqtt': {
            changeOrigin: true,
            target: 'http://localhost:8085',
            ws: true,
          },
        },
      },
    },
  };
});
