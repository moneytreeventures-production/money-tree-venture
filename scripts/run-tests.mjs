import { readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const compilerPath = resolve(projectRoot, "node_modules/typescript/bin/tsc");
const compiledTestsRoot = resolve(projectRoot, ".test-build/tests");

function testFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.isFile() && entry.name.endsWith(".test.js") ? [relative(projectRoot, path).split(sep).join("/")] : [];
  });
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: projectRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const compileStatus = run([compilerPath, "-p", "tsconfig.env-test.json"]);
if (compileStatus !== 0) process.exit(compileStatus);

const compiledTests = testFiles(compiledTestsRoot).sort();
if (compiledTests.length === 0) {
  console.error("No compiled tests were found under .test-build/tests.");
  process.exit(1);
}

const unitStatus = run(["--conditions=react-server", "--test", ...compiledTests]);
if (unitStatus !== 0) process.exit(unitStatus);

process.exit(run(["--test", "tests/email/netlify-function.test.mjs"]));
