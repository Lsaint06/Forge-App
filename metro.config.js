const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// Expo SQLite loads this bundled asset in the browser worker.
config.resolver.assetExts.push("wasm");
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "web" &&
    moduleName === "./WorkerChannel" &&
    /expo-sqlite[/\\]web[/\\]/.test(context.originModulePath)
  ) {
    return {
      type: "sourceFile",
      filePath: require.resolve("./src/platform/sqliteWorkerChannel.web.ts"),
    };
  }
  return resolveRequest
    ? resolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
