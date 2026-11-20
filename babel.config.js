module.exports = {
  presets: [
    ['babel-preset-expo', {
      decorators: {
        legacy: true,
      },
      // Web: compile imports to CommonJS as native does. The ESM path Expo picks for web turns
      // the app's circular imports into "Cannot access X before initialization" at startup.
      web: {
        disableImportExportTransform: false,
      },
    }],
  ],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: [
          '.ios.js',
          '.android.js',
          '.js',
          '.ts',
          '.tsx',
          '.json',
        ],
        alias: {
          '@assets': './assets',
          '@app': './src/application',
          '@actions': './src/actions',
          '@components': './src/components',
          '@app_constants': './src/app_constants.ts',
          '@data': './src/data',
          '@generated': './src/generated',
          '@icons': './src/icons',
          '@lib': './src/lib',
          '@navigation': './src/navigation',
          '@reducers': './src/reducers',
          '@styles': './src/styles',
        },
      },
    ],
  ],
};