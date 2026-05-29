export interface McpProvider<TItem = unknown> {
  readonly id: string
  readonly label: string
  readonly itemLabel: string
  /** 检查此 provider 必需的连接类 env var 是否存在 */
  isAvailable(): boolean
  /** 读取此 provider 预配置的 URL 列表（从环境变量，可为空） */
  getPresetUrls(): string[]
  fetch(urls: string[]): Promise<TItem[]>
  format(items: TItem[]): string
}
