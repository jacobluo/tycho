import { createApp } from "vue";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import App from "./App.vue";

window.__TYCHO_CLIENT__ = "vue-vite";

createApp(App).mount("#app");
