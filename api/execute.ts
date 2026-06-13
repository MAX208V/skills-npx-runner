import { execSync } from "child_process";

interface ExecuteRequest {
  command: string;
  skillName: string;
  source: string;
  callbackUrl: string;
  callbackToken?: string;
}

interface ExecuteResponse {
  success: boolean;
  skillName: string;
  source: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  parsedTools?: unknown[];
  error?: string;
}

export default async function handler(req: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  let body: ExecuteRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  const { command, skillName, source, callbackUrl, callbackToken } = body;

  if (!command || !skillName || !source) {
    return new Response(
      JSON.stringify({ error: "缺少必填参数: command, skillName, source" }),
      { status: 400, headers: { "Content-Type": "application/json", ...cors } }
    );
  }

  // ---- 执行 npx 命令 ----
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;

  try {
    const output = execSync(command, {
      timeout: 120_000, // 2 分钟超时
      maxBuffer: 10 * 1024 * 1024, // 10MB
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
    });
    stdout = output || "";
    exitCode = 0;
  } catch (err: any) {
    stdout = err.stdout || "";
    stderr = err.stderr || "";
    exitCode = err.status ?? 1;
  }

  // ---- 尝试解析输出中的工具定义 ----
  let parsedTools: unknown[] | undefined;
  let parsedDescription: string | undefined;

  // 尝试从 stdout 中提取 JSON
  try {
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.tools && Array.isArray(parsed.tools)) {
        parsedTools = parsed.tools;
        parsedDescription = parsed.description;
      }
    }
  } catch {
    // 非 JSON 输出，忽略
  }

  const result: ExecuteResponse = {
    success: exitCode === 0,
    skillName,
    source,
    stdout: stdout.slice(0, 50_000), // 限制输出大小
    stderr: stderr.slice(0, 10_000),
    exitCode,
    parsedTools,
    parsedDescription,
  };

  // ---- 回调 skills-mcp ----
  if (callbackUrl && exitCode === 0) {
    try {
      const registerBody: Record<string, unknown> = {
        name: skillName,
        source,
        description: parsedDescription || `Skill from ${source}`,
        tools: parsedTools || [],
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (callbackToken) {
        headers["Authorization"] = `Bearer ${callbackToken}`;
      }

      const callbackResp = await fetch(callbackUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(registerBody),
      });

      if (callbackResp.ok) {
        result.success = true;
      } else {
        result.error = `回调失败: ${callbackResp.status} ${await callbackResp.text()}`;
      }
    } catch (err: any) {
      result.error = `回调异常: ${err.message}`;
    }
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { "Content-Type": "application/json", ...cors },
  });
}
