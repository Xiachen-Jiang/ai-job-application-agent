import type { ZodTypeAny } from "zod";

export interface AgentContext {
  correlationId: string;
  logger: AgentLogger;
}

export interface AgentLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface AgentDefinition<TIn, TOut> {
  name: string;
  inputSchema: ZodTypeAny;
  outputSchema: ZodTypeAny;
  execute: (input: TIn, ctx: AgentContext) => Promise<TOut>;
  retry?: { maxAttempts: number; backoffMs: number };
}

export async function runAgent<TIn, TOut>(
  agent: AgentDefinition<TIn, TOut>,
  input: unknown,
  ctx: AgentContext
): Promise<TOut> {
  const parsed = agent.inputSchema.parse(input) as TIn;
  const maxAttempts = agent.retry?.maxAttempts ?? 1;
  const backoffMs = agent.retry?.backoffMs ?? 1000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      ctx.logger.info(`Running agent ${agent.name}`, { attempt });
      const result = await agent.execute(parsed, ctx);
      return agent.outputSchema.parse(result) as TOut;
    } catch (error) {
      lastError = error;
      ctx.logger.error(`Agent ${agent.name} failed`, {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, backoffMs * attempt));
      }
    }
  }

  throw lastError;
}

export function createLogger(correlationId: string): AgentLogger {
  return {
    info: (msg, meta) => console.log(JSON.stringify({ level: "info", correlationId, msg, ...meta })),
    error: (msg, meta) => console.error(JSON.stringify({ level: "error", correlationId, msg, ...meta })),
  };
}
