// MCP 外脑客户端:引擎在 MCP 座位轮到时,把决策请求发给本机桥(localhost:3015),
// 由外部 AI(MCP 客户端)接单。超时/不可达返回 ok:false,引擎回退该分身的 LLM。
const BRIDGE_BASE = 'http://localhost:3015';

export interface McpDecisionRequest {
    seat: number;
    name: string;
    role: string;
    phase: string;
    turnCount: number;
    actionInstruction?: string;
    /** LLM 提示词(原样转交,外部 AI 获得与模型相同的上下文) */
    messages: { role: string; content: string }[];
    validTargets?: number[] | null;
    timeoutMs?: number;
    /** 外部取消信号(引擎"暂停世界"/卸载时中断等待) */
    signal?: AbortSignal;
}

export interface McpActionResult {
    speak?: string;
    actionTarget?: number | null;
    strategySummary?: string;
    timedOut?: boolean;
}

export const isBridgeAlive = async (): Promise<boolean> => {
    try {
        const res = await fetch(`${BRIDGE_BASE}/health`, { signal: AbortSignal.timeout(1500) });
        return res.ok;
    } catch {
        return false;
    }
};

export const requestMcpDecision = async (req: McpDecisionRequest): Promise<{ ok: boolean; action?: McpActionResult; error?: string }> => {
    try {
        const timeoutSignal = AbortSignal.timeout(Math.min(req.timeoutMs || 240000, 250000));
        const signal = req.signal ? AbortSignal.any([timeoutSignal, req.signal]) : timeoutSignal;
        const res = await fetch(`${BRIDGE_BASE}/decision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
            signal,
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const action = await res.json();
        if (action?.timedOut) return { ok: false, error: '外脑超时' };
        return { ok: true, action };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
};

// 对局结束/开启时通知桥:结束让 agent 的 wait_for_my_turn 返回 ended,新局清掉结束标记
export const notifyBridgeGameOver = (): void => {
    fetch(`${BRIDGE_BASE}/game-over`, { method: 'POST', signal: AbortSignal.timeout(1500) }).catch(() => {});
};
export const notifyBridgeGameNew = (): void => {
    fetch(`${BRIDGE_BASE}/game-new`, { method: 'POST', signal: AbortSignal.timeout(1500) }).catch(() => {});
};
