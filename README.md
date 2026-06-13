# Skills npx Runner

Vercel npx 执行器 — 在 Node.js 环境中执行 `npx skills add` 命令，解析结果并回调 [skills-mcp](https://github.com/MAX208V/skills-mcp) 写入 KV。

## 架构

```
管理页面 (/admin)                    Vercel
      │                               │
      │  POST /api/skills/submit      │
      ▼                               │
skills-mcp (CF Workers)               │
      │                               │
      │  POST /api/execute ──────────→ 执行 npx skills add xxx
      │                               │
      │  ←──── 回调 /api/skills/register ── 写入 KV
      ▼
  注册完成
```

## 部署

```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 部署
vercel deploy --prod
```

## API

### POST `/api/execute`

执行 npx 命令并回调 skills-mcp。

**请求体：**

```json
{
  "command": "npx skills add Tencent/WeChatReading -g",
  "skillName": "WeChatReading",
  "source": "Tencent/WeChatReading",
  "callbackUrl": "https://skills-mcp.xxx.workers.dev/api/skills/register",
  "callbackToken": "mcp-auth-token"
}
```

**响应：**

```json
{
  "success": true,
  "skillName": "WeChatReading",
  "source": "Tencent/WeChatReading",
  "stdout": "...",
  "stderr": "",
  "exitCode": 0,
  "parsedTools": [...],
  "parsedDescription": "..."
}
```

## 环境变量

| 变量 | 说明 |
|------|------|
| (无) | 所有配置通过请求体传入 |

## 配置 skills-mcp

部署后，在 skills-mcp 的 wrangler.toml 中配置：

```toml
[vars]
VERCEL_EXECUTOR_URL = "https://your-app.vercel.app/api/execute"
```
