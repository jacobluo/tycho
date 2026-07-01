/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    __TYCHO_CLIENT__?: string;
  }
}
