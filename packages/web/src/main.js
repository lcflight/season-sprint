import { createApp } from "vue";
import App from "./App.vue";
import "./assets/theme.css";
import "./assets/modal.css";
import "./assets/toggle.css";
import "./assets/rank-indicator.css";
import router from "./router";
import { clerkPlugin } from "@clerk/vue";
import { dark } from "@clerk/themes";

const PUBLISHABLE_KEY = process.env.VUE_APP_CLERK_PUBLISHABLE_KEY;
const isLocalDevHost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";
const isLiveClerkKey =
  typeof PUBLISHABLE_KEY === "string" && PUBLISHABLE_KEY.startsWith("pk_live_");

if (!PUBLISHABLE_KEY && !process.env.VUE_APP_DEV_AUTH_TOKEN) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}

const app = createApp(App).use(router);

if (PUBLISHABLE_KEY && !(isLocalDevHost && isLiveClerkKey)) {
  app.use(clerkPlugin, {
    publishableKey: PUBLISHABLE_KEY,
    appearance: { theme: dark },
  });
} else if (isLocalDevHost && isLiveClerkKey) {
  console.warn(
    "Skipping Clerk plugin on localhost with a live key. Use a test key for local auth."
  );
}

app.mount("#app");
