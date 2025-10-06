module.exports = {
  presets: [
    "@babel/preset-typescript",
    [
      "@vue/cli-plugin-babel/preset",
      {
        useBuiltIns: "entry",
        corejs: 3,
      },
    ],
  ],
  plugins: [
    "@babel/plugin-proposal-class-properties",
    "@babel/plugin-proposal-object-rest-spread",
  ],
};
