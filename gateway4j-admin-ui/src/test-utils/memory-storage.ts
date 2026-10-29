/**
 * 测试专用 localStorage 替身。
 *
 * 背景：本仓库的 vitest jsdom 环境未暴露 localStorage（globalThis.localStorage 与
 * window.localStorage 均为 undefined，既有用例对 localStorage 只做源码正则断言，
 * 从未在运行时触碰）。H7b 环境维度的持久化行为需要运行时断言，测试文件在
 * beforeEach 调 installMemoryStorage() 装上最小实现即可。
 *
 * 业务代码侧不受影响：所有 localStorage 访问均有 try/catch 兜底，浏览器环境
 * 使用原生 localStorage。
 */
export class MemoryStorage implements Storage {
  private map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

/** 安装（幂等）：把 globalThis.localStorage 换成全新的 MemoryStorage 实例 */
export function installMemoryStorage(): MemoryStorage {
  const store = new MemoryStorage()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = store
  return store
}
