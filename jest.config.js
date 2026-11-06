module.exports = {
  preset: "jest-expo",
  testMatch: ["**/tests/ui/**/*.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/tests/ui/setup.ts"],
  maxWorkers: 2,
};
