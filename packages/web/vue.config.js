const { defineConfig } = require("@vue/cli-service");
module.exports = defineConfig({
  transpileDependencies: true,
  devServer: {
    allowedHosts: [".ngrok-free.app"],
    webSocketServer: false,
  },
});
