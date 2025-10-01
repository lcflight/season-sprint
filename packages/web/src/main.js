import { createApp } from "vue";
import App from "./App.vue";
import "./assets/theme.css";
import router from "./router";
import { clerkPlugin } from "@clerk/vue";
import { dark } from "@clerk/themes";

const PUBLISHABLE_KEY = process.env.VUE_APP_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}

//tmp call to api hello route for debugging
//add clerk auth header
fetch("https://season-sprint-server.lcarthur747.workers.dev/");

createApp(App)
  .use(router)
  .use(clerkPlugin, {
    publishableKey: PUBLISHABLE_KEY,
    appearance: { theme: dark },
  })
  .mount("#app");
