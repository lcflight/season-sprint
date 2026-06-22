const { defineConfig } = require("@vue/cli-service");
const webpack = require("webpack");
const path = require("path");
const dotenv = require("dotenv");

// Force-load workspace root env so web uses the shared .env file.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

module.exports = defineConfig({
  transpileDependencies: true,
  // Browser tab title (and the <noscript> fallback message). Without this,
  // html-webpack-plugin falls back to the package name ("web").
  chainWebpack: (config) => {
    config.plugin("html").tap((args) => {
      args[0].title = "Season Sprint — THE FINALS World Tour tracker";
      return args;
    });
  },
  configureWebpack: {
    plugins: [
      new webpack.DefinePlugin({
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
      }),
    ],
  },
  devServer: {
    allowedHosts: [".ngrok-free.app"],
    webSocketServer: false,
  },
});
