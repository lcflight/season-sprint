const { defineConfig } = require("@vue/cli-service");
const webpack = require("webpack");
const path = require("path");
const dotenv = require("dotenv");

// Force-load workspace root env so web uses the shared .env file.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

module.exports = defineConfig({
  transpileDependencies: true,
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
