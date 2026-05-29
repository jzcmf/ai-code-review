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
  minify: true,
  target: 'node18',
  noExternal: [/./],
  esbuildOptions(options) {
    options.platform = 'node'
  }
})
