// Separate transform for the real ESM Octokit stack; ordinary unit tests stay unchanged.
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/refresh/*.test.ts"],
  setupFiles: ["<rootDir>/tests/refresh/setup.ts"],
  transform: { "^.+\\.[tj]sx?$": "<rootDir>/scripts/refresh-transform.cjs" },
  transformIgnorePatterns: [
    "/node_modules/(?!(@octokit/|universal-user-agent/|before-after-hook/|p-limit/|yocto-queue/|content-type/))",
  ],
  moduleNameMapper: { "^src/(.*)$": "<rootDir>/src/$1" },
  testTimeout: 180000,
};
