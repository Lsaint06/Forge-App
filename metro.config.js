const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// FORGE Dev's Metro (`npm run start:dev`, Phase 8) runs with EXPO_NO_DOTENV:
// its JavaScript must carry the development project's values only. In
// development, Expo's env module still bundles .env, .env.local,
// .env.development and .env.development.local from the project root, over
// the launcher's values, so they are kept out of Metro's file map then.
// Expo Go (`npm start`), exports and EAS builds are unchanged.
if (process.env.EXPO_NO_DOTENV) {
  config.resolver.blockList = [
    ...[].concat(config.resolver.blockList ?? []),
    /(^|[\\/])\.env(\.[^\\/]*)?$/,
  ];
}

module.exports = config;
