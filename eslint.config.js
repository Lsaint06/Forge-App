const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expo,
  {
    ignores: [
      "dist/**",
      "dist-web/**",
      "test-results/**",
      "playwright-report/**",
      "node_modules/**",
    ],
  },
  // Skip import-parser inspection of generated dependency glue, not project code.
  // TypeScript and executable PostgreSQL tests validate the dependency interface.
  {
    files: ["tests/postgres.test.ts"],
    settings: { "import/ignore": ["node_modules/@electric-sql/pglite/dist/"] },
  },
]);
