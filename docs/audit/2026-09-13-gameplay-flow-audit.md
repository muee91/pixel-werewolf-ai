# 方块狼人杀 玩法与流程审计

审计日期：2026-09-13  
审计基线：`main`，HEAD `bb6216741b1f2a00fa4fb01fa3d0f5e3cf37503d`，工作区干净（`git status` 无输出）。  
审计范围：**每一个玩法与流程分支**（入夜 → 夜间行动 → 天亮 → 死亡技能 → 竞选 → 讨论 → 投票 → 结算 → 联机同步 → 存档回放）。  
审计目标：定位"实际玩的时候能遇到的 bug"，给出可复现证据、根因定位与修复方向。

## 结论摘要

规则引擎的**骨架是正确的**（死亡技能队列、警徽流解析、白痴翻牌、情侣殉情、可见性裁剪的设计都对），但**胜负判定与结算一致性存在 3 个 P0 级缺陷**，其中 Bug 1 会影响**每一局**。

本轮共确认 **3 个 P0 / 5 个 P1 / 6 个 P2**。

基线质量门（本次实测，全部通过）：

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | 通过，退出码 0 |
| `npm test` | **160/160 通过**（上一版审计记录为 142/142） |
| `npm run build` | 通过，退出码 0 |

**关键提醒：这三个 P0 缺陷现有测试全部覆盖不到，不是回归。** 更严重的是——`scripts/tests/game-rules.test.ts` 中有两条用例把 Bug 1 的错误行为**固化成了期望值**，修复时必须同步改测试，否则会出现"修了 bug 反而测试挂"。

## 复现方法（本次审计采用的证据来源）

为了让结论可复现，本次审计用**本地 mock LLM 驱动真实无头对局**，而不是只读代码：

1. 启动 Vite dev server：`DISABLE_AUX_SERVICES=1 npx vite --host 127.0.0.1 --port 3907 --strictPort`
2. 启动内置 mock LLM：`node scripts/mock-llm.mjs`（监听 `127.0.0.1:19000`）
3. 用 Playwright 注入供应商/模型/分身配置，点击板子卡片 → 点燃营火，跑到 `GAME_REVIEW`
4. 从 `localStorage` 导出 `werewolf-currentPlayers` / `-currentLogs` / `-currentGodState` / `-currentGameResult` 做逐条比对

共跑通 **4 局完整对局**：

| 板子 | preset key | 局数 | 结束天数 |
|---|---|---|---|
| 9人经典标准局 | `9-v1` | 1 | Day 2 |
| 12人丘比特情侣局 | `12-cupid` | 1 | Day 4 |
| 12人奇迹商人局 | `12-miracle-merchant` | 1 | Day 3 |
| 12人石像鬼守墓人局 | `12-stone-ghost-gravekeeper` | 1 | Day 4 |

完整的公共发言、逐票明细、`EVENT_TRACE` 状态变更与结算文本均已导出核对。

## 证据分级

- **已验证**：本次真实对局或纯函数复现直接观察到，附具体数据。
- **源码确认**：从调用链与实现可确认，逻辑路径明确。
- **存疑**：需要产品意图确认，可能是设计取舍而非缺陷。

---

# 一、P0 级缺陷（改变胜负结果 / 破坏核心玩法）

## Bug 1：屠边判定写成了"屠一边即胜"

**严重度：P0 · 影响面：所有板子、每一局**

### 现象（已验证）

9人经典标准局（`9-v1`），终局状态：

| 座位 | 角色 | 状态 |
|---|---|---|
| 1号 | 女巫（神） | **ALIVE** |
| 2号 | 村民（兼警长） | DEAD_VOTE |
| 3号 | 狼人 | ALIVE |
| 4号 | 村民 | DEAD_SHOOT |
| 5号 | 村民 | DEAD_NIGHT |
| 6号 | 预言家 | DEAD_NIGHT |
| 7号 | 狼人 | ALIVE |
| 8号 | 狼人 | ALIVE |
| 9号 | 猎人 | DEAD_VOTE |

2号（最后一个村民）被放逐后，引擎**立即**宣判并结算：

```
胜利阵营：狼人阵营
胜利原因：所有村民已出局，狼人屠民胜利。
当前天数：Day 2
```

但 **1号女巫仍然存活**。按屠边规则，狼人必须"杀光全部村民 **且** 杀光全部神职"才算胜利，此时游戏应当继续。

### 根因（已验证）

`src/game/rules.ts` → `checkWinCondition` 把三类判定写成了三个**互相独立**的短路分支：

```ts
if (wolvesCount === 0)    return GOOD;                        // 正确
if (villagersCount === 0) return WOLF / ALL_VILLAGERS_DEAD;   // ← 缺 "且 godsCount === 0"
if (godsCount === 0)      return WOLF / ALL_GODS_DEAD;        // ← 缺 "且 villagersCount === 0"
```

角色阵营划分取自 `src/types.ts`：`GOD_ROLES`（10 个）、`VILLAGER_ROLES`（仅 VILLAGER）、`WOLF_ROLES`（5 个），划分本身正确。

`WerewolfSkill.ts` 的提示词里写的是 `Werewolves: Kill all Villagers OR all Gods.`——**实现把 AND 关系拆成了两个独立触发的 OR 分支**。

### 独立复现（已验证）

将该终局局面固化为纯函数输入直接调用 `checkWinCondition`：

```
=> checkWinCondition result:
{"winner":"WOLF","reason":"ALL_VILLAGERS_DEAD","reasonText":"所有村民已出局，狼人屠民胜利。"}
```

期望 `null`。**确认是规则函数本身的问题，与 UI、LLM、时序、联机全都无关。**

### 影响

- 任意一局只要"先死光村民"或"先死光神"，游戏提前结束。
- `turnCount` 少打，MVP/SVP 评分错位（本局 MVP 3号狼人 38 分，是按只打了 2 天算出来的）。
- 反向也成立：若某板子狼人杀光村民但神全在，狼人本不该赢却赢了。

### 修复方向

```ts
const villagersWiped = villagersCount === 0;
const godsWiped = godsCount === 0;

if (villagersWiped && godsWiped) {
    // 两侧同时归零，按板子约定取一侧文案；建议优先报"屠民"
    return { winner: 'WOLF', reason: 'ALL_VILLAGERS_DEAD', reasonText: '村民与神职已全部出局，狼人胜利。' };
}
```

### ⚠️ 修复时必须同步改测试

`scripts/tests/game-rules.test.ts` 现有两条用例**把错误行为当成了期望**：

```
✔ wolves win immediately when the last villager dies, regardless of wolf parity
✔ wolves win immediately when the last god dies, regardless of wolf parity
```

第二条的用例数据是 `[狼人, 村民, 村民, 村民, 预言家(死)]`——**村民还活着 3 个，却断言狼胜**，这正是 Bug 1。修复后这两条必须重写为："村民归零**但神还在** → 返回 `null`"，并补一条"村民与神同时归零 → 狼胜"。

---

## Bug 2：结算页显示的警长是"已经失去警徽"的人，且情侣/第三方同样读到过期状态

**严重度：P0 · 影响面：所有涉及警徽转移或第三方阵营的结算**

### 现象（已验证）

12人丘比特情侣局（`12-cupid`），T4 日志时序：

```
[T4 DAY_ANNOUNCE] 天亮了。昨晚 9号 死亡。
[T4 DAY_ANNOUNCE] 9号警长夜间死亡，无有效警徽流，警徽流失。   ← 已明确宣告警徽流失
[T4 GAME_REVIEW ] 【游戏结算】
                  ...
                  警长：9号                                    ← 却仍显示 9号
```

`EVENT_TRACE` 进一步证实了时序倒置——`sheriffId` 的状态变更事件**发生在结算之后**：

```
[T4 GAME_REVIEW] 状态变化：sheriffId :: {"before": 9, "after": null}
[T4 GAME_REVIEW] 结算生成：WOLF :: {"sheriffId": 9}      ← 结算读到的仍是 9
```

### 根因（源码确认）

`src/hooks/useGameEngine.ts` 的 `DAY_ANNOUNCE` 分支中，警徽处理走异步状态更新：

```ts
setGodState(prev => ({ ...prev, sheriffId: null }));
await addSystemLog(`${deadSheriffId}号警长夜间死亡，无有效警徽流，警徽流失。`);
```

而 `finishGame` 通过 `useCallback` 闭包读取**渲染时的 `godState` 快照**：

```ts
`警长：${godState.sheriffId ? `${godState.sheriffId}号` : '无'}`
```

同一个 `try` 块内"先 set、紧接着调用 finishGame"，React 尚未提交新状态，闭包读到的仍是旧值。这是**同一渲染帧内的陈旧闭包读取**。

### 影响（比警长显示更危险的部分）

`finishGame` 的依赖数组同时包含 `godState.lovers` 与 `godState.cupidIsThirdParty`：

```ts
}, [addSystemLog, calcScore, ..., godState.sheriffId, godState.cupidIsThirdParty, godState.lovers, ...]);
```

也就是说——**第三方阵营胜利的判定与评分同样可能读到过期值**。当丘比特连结、情侣殉情与结算发生在同一帧时，`checkWinCondition` 判出 `THIRD_PARTY` 后，`finishGame` 里用于算 MVP/SVP 的 `isPlayerThirdParty` 可能基于旧 `lovers`，导致**评分给错人**。这条比警长文案更值得优先验证。

### 修复方向

`finishGame` 不应闭包读取 `godState`，改为接收显式最终快照：

```ts
const finishGame = useCallback(async (winState: WinResult, finalPlayers: Player[], finalGodState: GodState) => { ... });
```

或调用前用文件里已有的 `jotaiStore.get(godStateAtom)` 取实时值。**需要一并排查的 4 条"结算前改状态又立刻结算"的路径**：

1. `DAY_ANNOUNCE`（夜间死亡 → 警徽流失 → 结算）
2. `VOTING` 放逐（警徽转移 → 结算）
3. `HUNTER_ACTION`（开枪 → 殉情 → 结算）
4. `WOLF_EXPLODE`（自爆 → 警徽流失 → 结算）

---

## Bug 3：公开投票明细泄露完整票型，`voteDetailPublic: false` 形同虚设

**严重度：P0 · 影响面：所有开启了"票型不公开"的板子，含联机与回放**

### 现象（已验证）

`VOTE_TALLY` 日志**无条件**落盘完整逐票明细，T1 实例：

```
存活玩家: 1, 2, 3, 4, 6, 7, 8, 9

警长: 2号（票权 1.5）

逐票明细:
1号 -> 2号，权重 1，耗时 11ms
2号(警长) -> 6号，权重 1.5，耗时 11ms
3号 -> 9号，权重 1，耗时 11ms
4号 -> 弃票，权重 1，耗时 12ms
6号 -> 9号，权重 1，耗时 12ms
7号 -> 8号，权重 1，耗时 12ms
8号 -> 8号，权重 1，耗时 10ms
9号 -> 1号，权重 1，耗时 10ms
```

而 `WerewolfSkill.ts` 的提示词明确写着 `Vote details public: no; only summary should be public.`——**提示词承诺了不公开，实现照样全量公开**。

### 根因（源码确认）

`VOTING` 分支构造 `voteRows` 后，逐票明细被无条件写进日志与 `debugData`，`config.voteDetailPublic` **只用来决定那句"公开摘要"的措辞**，逐票明细本身没有任何裁剪：

```ts
const voteDetails = [
    `存活玩家: ${validTargetIds.join(', ')}`,
    `警长: ${sheriffId ? `${sheriffId}号（票权 ${getRule('sheriffVoteWeight')}）` : '无'}`,
    `逐票明细:`,           // ← 无条件
    ...voteByVoterLines,   // ← 无条件
];
```

`GodState` 中也没有"本轮各人票型"的可裁剪结构，历史页与回放页读的是**同一份 `logs`**。

### 影响

在 `voteDetailPublic: false` 的板子上，任何能看到日志的玩家——**包括联机客人、回放观众、观战者**——都能直接读到完整票型，**等于上帝视角**。这直接破坏狼人杀的核心推理。

### 修复方向

逐票明细仅在 `config.voteDetailPublic === true`（或上帝视角 / 复盘 `GAME_REVIEW`）时落盘；否则只保留汇总票数与平票候选。建议把票型单独存一份 `visibleTo: [GOD]` 的结构，而不是塞在全员可见的系统日志里。

---

# 二、P1 级问题（不改变胜负，但明显破坏体验）

## 问题 4：平票 PK 允许弃票，少数票即可决定出局

**严重度：P1 · 已验证**

T1 放逐投票 8号/9号 平票进入 PK，重投时合法目标只有 `{8, 9}`，但 8 张票里 **4 张弃票**，真实得票只有"9号 2 票"：

```
存活玩家: 8, 9
逐票明细:
1号 -> 弃票，权重 1
2号(警长) -> 弃票，权重 1.5     ← 警长也弃票
3号 -> 弃票，权重 1
4号 -> 9号，权重 1
6号 -> 9号，权重 1
7号 -> 弃票，权重 1
加权票数统计: 9号: 2票 / 弃票: 4票
最终出局: 9号
```

`resolveExileVote` 本身**逻辑正确**（已正确忽略 0 票目标、`tieRound` 保护到位）。问题在于**PK 轮允许弃票**：平票 PK 的规则本意是"只能在平票候选人中二选一"，允许弃票会让"弃票"变成事实上的强策略——**2 票就能淘汰一个人**。AI 大面积弃票时尤其明显。

**修复方向**：`tieRound > 0` 时从 `validTargetIds` 中剔除弃票选项，强制在候选人中做选择；若要保留弃票，至少应把弃票计入"未投票"，而不是让少数票决定出局。

## 问题 5：骑士决斗的插入时机与优先级存疑

**严重度：P1 · 存疑（需产品意图确认）**

`continueDayFlow` 的判定顺序硬编码为：

```
首夜遗言 → 警长竞选 → 骑士决斗 → 狼人自爆 → 白天发言
```

两个疑点：

1. 骑士第一天白天就能决斗，但流程把它排在**警长竞选之后**。标准打法是首日警上竞选结束、警长产生后才轮到骑士。
2. `knightChallenged` 是**全局一次性布尔**——骑士决斗不管发生在第几天都只触发一次，且决斗后**不会重置**，第二天不会再询问。

请确认这是设计意图。

## 问题 6：`wolfExplodeCheckedTurn` 每夜被清空，"每天一次"退化为"场场必问"

**严重度：P1 · 源码确认 + 日志佐证**

`NIGHT_START` 的 `setGodState` 中显式清空：

```ts
wolfExplodeCheckedTurn: null,
```

而 `shouldOfferWolfExplosion` 的判据是 `checkedTurn !== turnCount`：

```ts
export const shouldOfferWolfExplosion = (enabled, turnCount, checkedTurn, players) =>
    enabled && checkedTurn !== turnCount && players.some(canWolfSelfExplode);
```

每夜清空后，第二天 `null !== turnCount` 必然成立。从 4 局日志看，**每一天都打印了"狼人可以选择自爆"**，与该推断一致。

- 若设计意图是"每天都该问一次"：`wolfExplodeCheckedTurn` 是纯冗余字段，建议删除以免误导。
- 若设计意图是"每轮询问一次、放弃后当轮不再问"：清空即为 bug。

注意 `game-rules.test.ts` 已有用例 `wolf explosion is offered at most once per day`，但它只测了纯函数，**测不到引擎每夜清空这个行为**。

## 问题 7：奇迹商人技能类型缺失时静默失败

**严重度：P1 · 源码确认**

`MERCHANT_ACTION` 分支中，若 AI 返回了合法 `target` 但 `skillType` 非法：

```ts
const skillType = normalizeMerchantSkillType(result?.skillType);
if (targetPlayer && skillType) {   // ← skillType 为 null 时整块跳过
    ...
}
```

整个分支**静默什么都不做**：不发技能、不记日志、商人也不死。玩家只会看到"奇迹商人请闭眼"，**无从知晓发生了什么**，只能怀疑游戏卡了。

**修复方向**：加兜底日志（如"上帝(私聊): 未指定技能类型，本次发放作废"）。

## 问题 8：断线托管超时硬编码 120 秒且无倒计时

**严重度：P1 · 源码确认**

```ts
const HUMAN_INPUT_TIMEOUT_MS = 120000;
```

客人断线后房主要干等 **2 分钟**，且场上**没有任何倒计时提示**（只有超时后一条 toast）。局域网熟人局里这段观感很差，也容易被误判为"卡局"。

**修复方向**：做成可配置项，并在等待面板上显示剩余秒数。

**（顺带确认：托管逻辑本身是正确的）** 超时后走 AI 托管、重连可恢复手动操作，`VOTING` 阶段的"人类并排等待 + AI 限流并发"设计（`VOTE_LLM_CONCURRENCY = 3`）也合理，避免了云端 429 风暴。

---

# 三、P2 / 观察项

| # | 位置 | 问题 |
|---|---|---|
| 9 | `getVisiblePlayersForPlayer`（`useGameEngine.ts`） | 非狼非情侣的玩家一律被 `role: Role.VILLAGER` 覆盖。目前看是安全的，但"用 VILLAGER 冒充隐藏身份"这种做法，一旦 UI 上任何"村民"特判被抓到就会泄露。建议改用显式 `UNKNOWN` 哨兵值。 |
| 10 | `server/visibility.ts` vs `src/utils/visibility.ts` | 两份可见性实现**各自维护**一份 `WOLF_ROLES` 与角色掩码规则，且服务端 `buildVisibleGodState` 与客户端 `buildAdvisorGodState` 分支不完全一致。长期必然漂移，建议抽成单一来源。 |
| 11 | `useHostBroadcast` | 1 秒轮询**全量** `GAME_STATE_SYNC`（含全部 logs）广播给每个客人，`logs` 无增量机制。局末 logs 已触及 500 上限，对局越长广播越重。 |
| 12 | `MAX_GAME_LOGS = 500` | 4 局实测中，**4 天的 12 人局就已经顶到 500 条上限**并开始丢弃早期日志，导致复盘缺头；`keyEvents` 的 `.slice(-24)` 也会被挤掉。建议区分"引擎内部日志上限"与"归档保留上限"。 |
| 13 | 2D 观战界面 | `LAST_WORDS` 阶段死者是村民时，提示语与猎人开枪用词混用；`DAY_DISCUSSION` 出现同一位玩家连续两条相同发言（如 4号连发两次），成因是 `getNextSpeaker` 依赖 `logs` 去重，但 LLM 重试路径会追加第二条日志。 |
| 14 | 构建体积 | `ForestCampScene` 942 kB、llm chunk 225 kB，仍是首屏最大风险项，与上一版审计结论一致，未改善。 |

---

# 四、逐玩法/流程结论

| 玩法 / 流程 | 结论 | 说明 |
|---|---|---|
| 屠边胜负判定 | ❌ **P0** | Bug 1，提前结算，影响每一局 |
| 结算信息一致性 | ❌ **P0** | Bug 2，警长/情侣/第三方可能读到过期状态 |
| 投票票型可见性 | ❌ **P0** | Bug 3，`voteDetailPublic: false` 形同虚设 |
| 平票 PK | ⚠️ P1 | 允许弃票导致少数票决定出局 |
| 夜间行动（狼/预/女/守） | ✅ 正确 | 守卫连守、同守同救、女巫自救限制、血月封印判定链完整 |
| 猎魔人 / 守墓人 / 石像鬼 | ✅ 正确 | 验人结果私聊、死亡合并进 `deathsTonight` 路径无误 |
| 奇迹商人 | ⚠️ P1 | 主体正确；技能类型缺失时静默失败（问题 7） |
| 警长竞选 / 退水 / 警徽流 | ✅ 正确 | 流程完整；`parseSheriffFlow` 只认"警徽"字样以防误判，设计正确 |
| 死亡技能（猎人/狼王/殉情/白狼王带人） | ✅ 正确 | 队列化处理正确，`appendPendingDeathActionIds` 去重可靠 |
| 白痴翻牌 | ✅ 正确 | 翻牌存活、失去投票权、`getExileVoterIds` 剔除均正确 |
| 狼人自爆 / 双爆吞警徽 | ⚠️ P1 | 主体正确；重复询问问题见问题 6 |
| 多人同步 / 可见性裁剪 | ✅ 有效 | 客人视角脱敏有效；两份实现有漂移风险（问题 10） |
| 存档 / 回放 / 迁移 | ⚠️ P2 | 500 条上限导致长局复盘缺头 |
| 构建与测试 | ✅ 通过 | typecheck / 160 单测 / build 全部通过 |

---

# 五、修复优先级建议

### P0（建议立即修）

1. **Bug 1 屠边判定**——唯一一个"每局都会发生、玩家一定能感知"的错误。**必须连带重写 `game-rules.test.ts` 中两条把错误行为固化为期望的用例。**
2. **Bug 2 结算状态一致性**——优先排查第三方阵营评分路径（比警长文案影响更大）。
3. **Bug 3 票型泄露**——在 `voteDetailPublic: false` 的板子上等于开天眼。

### P1（内测前建议修）

4. 平票 PK 禁止弃票（问题 4）
5. 确认骑士决斗时机与 `knightChallenged` 重置策略（问题 5）
6. 明确 `wolfExplodeCheckedTurn` 语义并修正（问题 6）
7. 商人技能类型缺失加兜底日志，消除静默失败（问题 7）
8. 托管超时可配置 + 倒计时 UI（问题 8）

### P2（后续优化）

9. 统一服务端/客户端可见性实现（问题 10）
10. 多人同步改为增量推送（问题 11）
11. 拆分归档日志上限与引擎日志上限（问题 12）
12. 3D chunk 拆分与首屏性能测量（问题 14）

---

# 六、建议补充的回归用例

修复时应补齐以下测试（当前全部缺失）：

1. `checkWinCondition`：村民归零**但神仍存活** → 返回 `null`（**这条正是 Bug 1**）
2. `checkWinCondition`：村民与神**同时**归零 → 狼胜，reason 符合板子约定
3. `checkWinCondition`：神归零**但村民仍存活** → 返回 `null`
4. 结算快照一致性：结算读到的 `godState` 必须是**同一帧内的最终值**（覆盖警徽流失、情侣殉情两条路径）
5. `voteDetailPublic: false` 时，落盘日志**不含**逐票明细
6. PK 轮（`tieRound > 0`）的 `validTargetIds` 不含弃票选项

---

## 附：本次审计的边界

- 使用 **mock LLM**，验证的是规则引擎与流程编排，**不代表真实模型的输出质量**。
- 未覆盖 Android 真机、Electron 打包、真实 TTS 音频链路。
- 联机部分沿用"同一可信局域网内的朋友"威胁模型（与 README 一致），未评估公网/陌生用户场景。
- 问题 5、6 属**存疑项**，需产品意图确认后才能判定是缺陷还是设计取舍。
