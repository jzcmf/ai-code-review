import { defineConfig } from 'tsup'
import fs from 'node:fs'
import path from 'node:path'

const envPath = path.resolve(process.cwd(), '.env')
const envConfig: Record<string, string> = {}
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (match) {
      envConfig[match[1]] = match[2].replace(/(^['"]|['"]$)/g, '')
    }
  })
}

const requiredBuildEnvKeys = [
  '__AI_REVIEW_BUILD_MCP_YUQUE_PKG',
  '__AI_REVIEW_BUILD_YUQUE_PROXY_URL',
  '__AI_REVIEW_BUILD_MCP_TAPD_URL'
] as const

const missingBuildEnvKeys = requiredBuildEnvKeys.filter((key) => !envConfig[key]?.trim())
if (missingBuildEnvKeys.length > 0) {
  throw new Error(
    [
      `缺少构建期环境配置：${missingBuildEnvKeys.join(', ')}`,
      `请在项目根目录 .env 中补充以上配置后重新打包：${envPath}`
    ].join('\n')
  )
}

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
  env: {
    __AI_REVIEW_BUILD_MCP_YUQUE_PKG: envConfig.__AI_REVIEW_BUILD_MCP_YUQUE_PKG || '',
    __AI_REVIEW_BUILD_YUQUE_PROXY_URL: envConfig.__AI_REVIEW_BUILD_YUQUE_PROXY_URL || '',
    __AI_REVIEW_BUILD_MCP_TAPD_URL: envConfig.__AI_REVIEW_BUILD_MCP_TAPD_URL || ''
  },
  esbuildOptions(options) {
    options.platform = 'node'
  }
})
