import type { ReviewMode } from '../shared/types.js'

export const DEFAULT_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_MODEL = 'deepseek-v4-pro'
export const DEFAULT_TEMPERATURE = 0.2
export const DEFAULT_REVIEW_MODE: ReviewMode = 'diff-only'
export const DEFAULT_MAX_TOKENS = 2000
export const MAX_FILE_DIFF_CHARS = 18000
export const MAX_TOTAL_DIFF_CHARS = 50000
export const ENV_FILE_NAME = '.env.ai-review'

export const DEFAULT_CUSTOM_RULES = `以下为前端缺陷预防规则，请严格遵守：

### 业务规则（金额/时间）
- 金额处理必须使用项目统一封装方法，禁止直接做浮点运算（如 0.1*3=0.3000...），涉及运算用 decimal.js 或后端统一计算
- 时间格式化统一使用项目封装方法，注意 HK/EU 不同地区格式差异
- 币种精度：注意收款需自行放大缩小 100 倍，收单接口直接返回精度

### 逻辑类
- 空值防护：取值前使用 ?. / ??，API 层做数据规范化，禁止使用 any 类型
- 重复请求：按钮必须加 loading/禁用态，监听依赖最小化，注意初始化+监听双重触发
- 日期处理：new Date() / dayjs() 前先判断有效性
- 输入框必须设置 maxlength，与后端约定一致
- 页面跳转：注意关闭、前进后退、返回按钮等路径正确性

### 表单类
- 联动清理：条件切换时必须清理关联字段，避免无效字段提交
- 级联重置：主条件变更时级联重置子条件，穷举验证所有条件组合
- 校验规则：需求阶段明确字段的必填/格式/长度/业务规则，正则与后端保持一致

### 数据渲染
- 空数据：列表判空展示空态占位，null/undefined 数据展示为 "-"
- 长整型精度：后端返回的超大 ID（超过 9007199254740991）必须转字符串处理
- 数据加载时必须有 loading 或骨架屏反馈

### 页面样式
- 文本溢出：单行截断 + Tooltip 展示完整内容
- 响应式：设置最小宽度，写完拖拽窗口检查，换浏览器验证
- 列表列宽：根据字段实际内容设置合理列宽
- 严格按设计图尺寸开发，完成后走查

### 性能与内存
- 避免依赖环：A 依赖 B、B 又依赖 A 的模式改为共同依赖独立状态
- 第三方插件（ECharts/Excel/PDF/富文本）在 onUnmounted 中调用销毁方法
- window.addEventListener 必须在组件销毁时解绑

### 移动端
- 软键盘：flex 布局让内容随键盘滚动，键盘弹出不应关闭抽屉
- 安全区适配：padding: env(safe-area-inset-*)，viewport-fit=cover

### 安全与权限
- 密码必须加密传输，开发前与后端约定加密方式
- 敏感信息（手机号/邮箱/证件号）展示时需脱敏
- 所有编辑/操作按钮需要权限控制`

export const CODE_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.vue',
  '.py',
  '.java',
  '.go',
  '.php',
  '.rb'
] as const

export const IGNORED_PATH_PARTS = ['node_modules/', 'dist/', 'build/', '.git/', 'coverage/'] as const
