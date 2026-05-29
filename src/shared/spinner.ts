import { stdout as output } from 'node:process'
import { logError, logInfo, logSuccess } from './logger.js'

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null
  private frameIndex = 0
  private active = false
  private static frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

  constructor(private message: string) {}

  start(): void {
    if (this.active) return
    this.active = true
    if (!output.isTTY) {
      logInfo(this.message)
      return
    }
    this.timer = setInterval(() => {
      process.stdout.write(`\r\x1b[K${Spinner.frames[this.frameIndex]} ${this.message}`)
      this.frameIndex = (this.frameIndex + 1) % Spinner.frames.length
    }, 80)
  }

  update(message: string): void {
    this.message = message
  }

  succeed(message: string): void {
    this.stop()
    logSuccess(message)
  }

  fail(message: string): void {
    this.stop()
    logError(message)
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    process.stdout.write('\r\x1b[K')
  }
}
