const { getDefaultConfig } = require("expo/metro-config");
const { mergeConfig } = require("@react-native/metro-config");

const path = require("path");

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

// Web build only: native-only modules resolve to the stand-ins in web/shims (and op-sqlite to a
// sql.js driver). Native builds never see this map.
const WEB_SHIMS = {
  "@op-engineering/op-sqlite": "src/data/sqlite/webSqlite.ts",
  "@react-native-firebase/app": "web/shims/firebase.ts",
  "@react-native-firebase/auth": "web/shims/firebase-auth.ts",
  "@react-native-firebase/database": "web/shims/firebase-database.ts",
  "@react-native-firebase/crashlytics": "web/shims/firebase-crashlytics.ts",
  "@react-native-firebase/analytics": "web/shims/firebase-analytics.ts",
  "@react-native-firebase/functions": "web/shims/firebase-functions.ts",
  "@react-native-google-signin/google-signin": "web/shims/native.tsx",
  "@invertase/react-native-apple-authentication": "web/shims/native.tsx",
  "@react-native-documents/picker": "web/shims/native.tsx",
  "react-native-keychain": "web/shims/native.tsx",
  "react-native-sha256": "web/shims/native.tsx",
  "react-native-color-matrix-image-filters": "web/shims/native.tsx",
  "react-native-config": "web/shims/native.tsx",
  "react-native-share": "web/shims/native.tsx",
  "react-native-haptic-feedback": "web/shims/native.tsx",
  "lottie-react-native": "web/shims/lottie.tsx",
  "@shopify/react-native-skia": "web/shims/nullComponents.ts",
  "victory-native": "web/shims/nullComponents.ts",
};

function resolveRequest(context, moduleName, platform) {
  if (platform === "web") {
    if (WEB_SHIMS[moduleName]) {
      return { type: "sourceFile", filePath: path.resolve(__dirname, WEB_SHIMS[moduleName]) };
    }
    // sql.js guards its node:fs / node:crypto requires behind a Node check.
    if (moduleName.startsWith("node:")) {
      return { type: "empty" };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
}

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  transformer: {
    babelTransformerPath: require.resolve("react-native-svg-transformer")
  },
  resolver: {
    assetExts: [...assetExts.filter((ext) => ext !== "svg"), "txt", "db"],
    sourceExts: [...sourceExts, "svg"],
    resolveRequest,
  }
};

module.exports = mergeConfig(defaultConfig, config);
