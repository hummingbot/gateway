/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GATEWAY_URL?: string;
  readonly VITE_GATEWAY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
