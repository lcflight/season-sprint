const { defineConfig } = require("@vue/cli-service");
const webpack = require("webpack");
const path = require("path");
const dotenv = require("dotenv");

// Emits /asset-manifest.json: every content-hashed file in the build. The
// service worker (public/sw.js) caches all of them before it stores a new
// offline shell, so lazy routes (Ranked, Settings, …) also work offline.
// Keep the pattern in step with HASHED_RE in public/sw.js.
const HASHED_ASSET_RE = /^(js|css|img|fonts|media|tracker)\/[^/]+\.[0-9a-f]{8}\.[a-z0-9]+$/i;
class AssetManifestPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap("AssetManifestPlugin", (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: "AssetManifestPlugin", stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT },
        (assets) => {
          const files = Object.keys(assets)
            .filter((f) => HASHED_ASSET_RE.test(f))
            .map((f) => "/" + f)
            .sort();
          compilation.emitAsset("asset-manifest.json", new webpack.sources.RawSource(JSON.stringify({ files }, null, 1)));
        }
      );
    });
  }
}

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
    module: {
      rules: [
        // Screen-tracker templates (src/tracker/templateFiles.js).
        { test: /\.pgm$/, type: "asset/resource", generator: { filename: "tracker/[name].[contenthash:8][ext]" } },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
      }),
      new AssetManifestPlugin(),
    ],
  },
  devServer: {
    allowedHosts: [".ngrok-free.app"],
    webSocketServer: false,
  },
});
