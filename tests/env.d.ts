/** 测试脚本在 Node 环境下运行，这里做最小声明，避免引入完整的 @types/node */
declare const process: { exit(code: number): never }

/** 信息架构验收用例需要读取源码做入口检查，这里只声明用到的最小接口 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf-8'): string
}
