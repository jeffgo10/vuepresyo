import { createApp } from "vue";
import "@/src/assets/globals.css";
import App from "./App.vue";
import { router } from "./router";

createApp(App).use(router).mount("#app");

