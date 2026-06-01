import { defineConfig } from 'tsup'

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
  }
})
