import type { RendererApi } from '../shared/api';

declare global {
  interface Window {
    api: RendererApi;
  }
  interface ImportMetaEnv {
    readonly DEV: boolean;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
export {};
