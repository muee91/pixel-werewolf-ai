# Werewolf MCP Server

让任意兼容 MCP 的客户端以**玩家身份**进入联机对局。

## 原理

```
┌──────────────┐   WS/HTTP    ┌──────────────┐   转发行动    ┌────────────────┐
│ MCP 客户端    │──stdio──▶│ werewolf-mcp │──────────▶│ 房间服务端 :3002 │
│ (AI 玩家大脑) │            │ (客人玩家会话) │            └───────┬────────┘
└──────────────┘            └──────────────┘      按视角过滤的状态  │
                                                          ┌───────▼────────┐
                                                          │ 房主浏览器引擎   │
                                                          │ (游戏主循环)     │
                                                          └────────────────┘
```

- MCP server 以**客人玩家**身份 join + AUTH 进房间，与人类客人走完全相同的通路；
- 服务端下发前已按该座位视角过滤状态（**防作弊边界在服务端**，agent 只能看到自己该看的信息）；
- 轮到 agent 座位时，房主引擎会等待 `PLAYER_ACTION`，agent 用 `submit_action` 提交即可。

## 使用

1. 启动游戏与房间服务端（`npm run dev` 会自动拉起，房间服务端在 `:3002`）；
2. 浏览器里「联机服务器 → 创建房间」，房主留在等待区；
3. 在 MCP 客户端里让 agent：`join_room` → （房主点开始游戏）→ 循环 `wait_for_my_turn` → `submit_action`。

## 注册到 MCP 客户端

项目根目录的 `.mcp.json` 已注册（`node mcp/werewolf-mcp.mjs`）。手动注册示例：

```json
{
  "mcpServers": {
    "werewolf": {
      "command": "node",
      "args": ["mcp/werewolf-mcp.mjs"],
      "env": { "WEREWOLF_ROOM_HOST": "http://localhost:3002" }
    }
  }
}
```

远程房主：`WEREWOLF_ROOM_HOST` 填房主机器的局域网地址（如 `http://192.168.1.5:3002`），或在会话里调 `set_server_host`。

## 工具

| 工具 | 说明 |
|---|---|
| `list_rooms` | 列出等待中的房间 |
| `join_room` | 指定房间加入（自动 READY、自动确认角色）。房间号来自房主的「邀请 MCP Agent」按钮 |
| `get_room_state` / `get_game_state` | 房间成员 / 按我视角过滤后的对局状态 + 最近日志 |
| `wait_for_my_turn` | 阻塞等待轮到自己（对局结束或超时返回） |
| `submit_action` | 提交发言 / 投票 / 技能目标 / 特殊动作（等房主 ACK） |
| `set_ready` / `leave_room` / `set_server_host` | 准备、离开、切换服务端 |

> 说明：按房主偏好，MCP 玩家通过「复制邀请提示词」方式入局（含房间号），不做自动发现/自动加入。

## 冒烟与实战

- `node scripts/mcp-smoke.mjs` — 协议冒烟（initialize/tools/join/状态守卫）；
- `node scripts/mcp-play.mjs [roomId]` — agent 实战驱动（自动发言/投票打完整局）。


## 单机模式（MCP 外脑 · 枢纽 + 每会话代理）

单机对局跑在浏览器里。支持**多个 AI 会话各演一个分身**,互不串信息:

```
浏览器引擎 ──HTTP:3015──▶ standalone-hub(枢纽,按分身名路由) ◀── each session: standalone-agent.mjs(stdio)
```

1. 设置 → 玩家与分身 → 编辑分身 → 大脑选「MCP 外脑」→ 点「复制邀请提示词」;
2. 每个要演分身的 AI 会话:粘贴提示词(内含认领自己的分身名 → claim_seat);
3. 枢纽没跑时提示词会引导 AI 自行后台启动 `npm run mcp-bridge`;
4. 开局:每个会话只会收到**自己分身**的决策(信息墙在枢纽),提交后引擎继续;
5. 外脑超时/枢纽没起/没会话认领 → 该分身自动回退 LLM。

### 多会话规则

- `claim_seat` 按分身名认领,一名额一会话,重复认领被拒;
- 轮询/提交都校验归属,拿到别人分身的单会被拒;
- `get_game_state` 只暴露自己分身的挂起与历史;
- `{waiting:true}` = 阶段间隙继续轮询;`{ended:true}` = 对局结束。

### 可控性设计（防会话被游戏劫持）

- 枢纽与代理**都不注册进项目 `.mcp.json`**——工具只出现在你手动注册的那个会话里;
- 所有游戏工具描述都带「仅限狼人杀对局」守卫,非游戏任务不应调用;
- 阻塞等待默认超时很短(20s),误调代价可控。
