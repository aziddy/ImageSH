import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtimeRequire = createRequire(import.meta.url);

// Exercise the actual TypeScript modules with isolated auth/storage dependencies.
export function loadSource(path, overrides = {}) {
    const cache = new Map();
    function load(relativePath) {
        const filename = resolve(root, relativePath);
        if (cache.has(filename)) return cache.get(filename).exports;
        const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
        });
        const loaded = { exports: {} };
        cache.set(filename, loaded);
        new Function('require', 'module', 'exports', outputText)(name => {
            if (Object.hasOwn(overrides, name)) return overrides[name];
            if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
            return runtimeRequire(name);
        }, loaded, loaded.exports);
        return loaded.exports;
    }
    return load(path);
}
