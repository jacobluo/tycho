import { createApp } from "vue";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import App from "./App.vue";
import { router } from "./router";

window.__TYCHO_CLIENT__ = "vue-vite";

createApp(App).use(router).mount("#app");
