import { defaultResponseInterceptor, RequestClient } from '@vben/request';

const baseURL = import.meta.env.VITE_SCADA_API_URL || '/scada-api';

/** Raw scada-engine JSON (no Vben {code,data} envelope). */
export const scadaClient = new RequestClient({
  baseURL,
  responseReturn: 'body',
  timeout: 15_000,
});

scadaClient.addResponseInterceptor(
  defaultResponseInterceptor({
    codeField: 'code',
    dataField: 'data',
    successCode: 0,
  }),
);

export function scadaErrorMessage(error: unknown): string {
  const err = error as {
    response?: { data?: { error?: string; message?: string } };
    message?: string;
  };
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    'scada request failed'
  );
}
