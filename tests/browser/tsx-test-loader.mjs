import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

export function loadTranspiledTsx(sourcePath) {
  const ts = require("typescript");
  const Module = require("node:module");
  const absolutePath = path.resolve(sourcePath);
  const source = readFileSync(absolutePath, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const componentModule = new Module(absolutePath);
  componentModule.filename = absolutePath;
  componentModule.paths = Module._nodeModulePaths(path.dirname(absolutePath));
  const nativeRequire = createRequire(absolutePath);
  componentModule.require = (request) => {
    if (request.startsWith(".")) {
      const base = path.resolve(path.dirname(absolutePath), request);
      for (const candidate of [`${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, path.join(base, "index.tsx"), path.join(base, "index.ts")]) {
        if (existsSync(candidate) && /\.tsx?$/.test(candidate)) return loadTranspiledTsx(candidate);
      }
    }
    return nativeRequire(request);
  };
  componentModule._compile(compiled, absolutePath);
  return componentModule.exports;
}
