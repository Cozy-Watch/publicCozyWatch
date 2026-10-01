/* eslint-disable @typescript-eslint/no-require-imports -- Jest loads this synchronous transformer as CommonJS. */
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { createTransformer } = require("ts-jest").default;

// Baseline uses committed production sources in memory. Never check out or overwrite WIP.
const root = path.resolve(__dirname, "..");
const baseline = process.env.COZYWATCH_REFRESH_BASELINE;
const revision = baseline
  ? execFileSync("git", ["rev-parse", "--verify", "--end-of-options", `${baseline}^{commit}`], {
      cwd: root, encoding: "utf8",
    }).trim()
  : "working-tree";
const transformer = createTransformer({
  tsconfig: {
    rootDir: root,
    allowJs: true,
    module: "CommonJS",
    moduleResolution: "node",
    isolatedModules: true,
  },
});

module.exports = {
  process(source, filename, options) {
    const relative = path.relative(root, filename).split(path.sep).join("/");
    if (baseline && relative.startsWith("src/")) {
      source = execFileSync("git", ["show", `${revision}:${relative}`], {
        cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
      });
    }
    return transformer.process(source, filename, options);
  },
  getCacheKey(source, filename, options) {
    return `${revision}:${transformer.getCacheKey(source, filename, options)}`;
  },
};
