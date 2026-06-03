import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rulesContent = readFileSync(resolve('review-rules.mdc'), 'utf8')

export default defineConfig({
  entry: { 'ai-review': 'src/index.ts' },
  outDir: 'dist',
  format: ['esm'],
  outExtension: () => ({ js: '.mjs' }),
  dts: false,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: false,
  target: 'node18',
  external: ['@modelcontextprotocol/sdk', 'cross-spawn'],
  esbuildOptions(options) {
    options.platform = 'node'
    options.define = {
      __BUILTIN_RULES__: JSON.stringify(rulesContent)
    }
  }
})
