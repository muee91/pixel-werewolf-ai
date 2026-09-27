# 方块狼人杀 游戏引擎全量规则与流程审计报告

> 审计日期：2026-09-14
> 基线：`a297be8`（HEAD，`fix: 狼刀兜底按狼聊多数意见;发言长文可滚动;死亡播报句式修正`）
> 范围：`src/game/rules.ts`（219 行）+ `src/hooks/useGameEngine.ts`（3837 行，GOD-loop 主流程）+ `src/types.ts`（Role/GamePhase/阵营定义）+ `src/utils/wolfChatTarget.ts` + 现有单测
> 方式：源码逐项核对 + 真实对局复现（Playwright 驱动本地引擎 + mock LLM）+ 现有单测基准
> 原则：**不改动任何源代码**，仅审计与报告

---

## 一、结论摘要

总体评价：**引擎对狼人杀核心规则与玩法的实现在绝大多数环节是正确的**，且有较完整的单测覆盖（`game-rules.test.ts` 20 个用例、`win-condition-slaughter-side.test.ts`、`wolf-chat-target.test.ts`、`replay-deaths.test.ts`）。此前审计发现的多个问题已在后续 commit 修复。

**现存需关注的问题（按严重度）：**

| 编号 | 严重度 | 位置 | 问题 |
|---|---|---|---|
| G-1 | P1（规则意图存疑） | `rules.ts:59-63` | 狼王 `eligibleDeath` 含 `DEAD_SHOOT`，被枪杀后仍可回枪 |
| G-2 | P1 | `useGameEngine.ts:2893` | 平票 PK 轮允许弃票，少数票即可决定出局 |
| G-3 | P2（健壮性） | `useGameEngine.ts:3821-3823` | GOD-loop `try/finally` 无 `catch`，async 异常中断 switch 有僵局风险 |
| G-4 | P2（规则意图存疑） | `useGameEngine.ts:2128-2143` | 仅剩石像鬼时狼方晚间无刀、且计入 wolvesCount 造成长残局 |
| G-5 | P2（配置项） | `multiplayer/constants.ts:4` | `HUMAN_INPUT_TIMEOUT_MS` 硬编码 120 秒（联机倒计时 UI 已补） |
| G-6 | P1（配置失效） | `useGameEngine.ts:493` + `types.ts:490` + `SettingsView.tsx:945-951` | 狼人自爆要求 `wolfSelfExplode && wolfExplodeEnabled` 双 true，但 UI 只暴露 `wolfExplodeEnabled`；默认配置 `wolfSelfExplode:false` → 用户开"自爆"开关仍不生效 |
| G-7 | P2（规则未实现） | `types.ts:343`（+多个预设设 true） | `doubleExplodeNoSheriff` 在 types/预设中定义但引擎无任何判断，永不生效 |

> **修复状态（2026-09-14 审计同日）**：G-2 / G-3 / G-6 及 5.5 中「女巫毒药误锁」「丘比特自我连结」已修复，5.5 中「放逐 PK 投票范围」经复核为过期结论（详见文末「七、修复记录」）；G-1 / G-4 / G-5 / G-7 及其余口径观察项保持待设计决策。

**已确认修复（复验通过）：**
- ✅ 狼刀兜底按狼聊多数意见（`wolfChatTarget.ts` + `useGameEngine.ts:2172-2239`）
- ✅ 奇迹商人技能类型缺失不再静默失败（`useGameEngine.ts:3382-3385`）
- ✅ 结算读取最新 `finalGodState`（`useGameEngine.ts:701`）
- ✅ 死亡播报句式、发言长文滚动等体验项

**已在 HEAD 实跑验证正常的流程：** 警长退水、警长投票、放逐投票、投票 PK、预言家/女巫/守卫/猎魔人夜间行动、狼人自爆、自爆后流程、第二轮发言。

---

## 二、审计方法

### 证据来源
1. **源码核对**：`rules.ts` 全部纯函数的实现；`useGameEngine.ts` 每个 `case GamePhase.X` 分支的完整代码路径。
2. **真实对局复现**：用 Playwright 驱动本地 Vite + mock LLM（http://127.0.0.1:19000），完整跑通「血月使徒猎魔人 12 人局」，观察退水、竞选、投票、自爆等阶段的实际行为。
3. **单测基准**：`scripts/tests/` 下与规则相关的 20+ 用例。

### 分级定义
- **P0**：改变胜负结果 / 破坏核心玩法 / 必然死局
- **P1**：明显破坏体验或与规则意图冲突，但不必然导致胜负错误
- **P2**：健壮性、边界、配置项问题
- **观察项**：设计意图待确认，当前实现可接受

---

## 三、已验证正确的核心规则（屠边）

`src/game/rules.ts` → `checkWinCondition`（164-219 行）**完全正确**：

```ts
// 屠边 = "村民全灭 或 神全灭" 即狼胜（OR 语义，非 且 语义）
if (wolvesCount === 0)    return GOOD;                    // 狼全灭 → 好人胜
if (villagersCount === 0) return WOLF / ALL_VILLAGERS_DEAD; // 屠民 → 狼胜
if (godsCount === 0)      return WOLF / ALL_GODS_DEAD;     // 屠神 → 狼胜
```

- 第三方（丘比特/情侣）判定在狼人判定**之前**（173-191 行），优先级正确。
- `isEffectivelyAlive`（23-25 行）同时计入 `ALIVE` 与 `IDIOT_REVEALED`，白痴翻牌后仍算存活神职，屠神判定正确。
- 引擎在正确时序调用（先结算全部死亡技能再判胜负，见 `useGameEngine.ts:2581/2993/3604/1944`），不会提前结束。

**已有单测覆盖**：`game-rules.test.ts`（28-89 行）、`win-condition-slaughter-side.test.ts`（村民全灭=狼胜、民边未灭则继续，均通过）。

> ⚠️ 历史误报澄清：早期一份审计把屠边写成了"必须村民且神都灭才算狼胜"，**这是对规则的误解**。屠边 OR 是标准狼人杀规则，引擎实现正确，**不应修改**。（详见 `2026-09-13-gameplay-flow-audit.md` 中 Bug 1 的撤销说明。）

---

## 四、逐玩法 / 流程审计结论

### 4.1 狼人阵营

#### 狼刀（`WEREWOLF_ACTION`，2122-2273 行）✅ 正确
- 参与讨论者 = 存活狼队 **排除石像鬼**（2126 行），石像鬼不参与狼聊 ✅
- 最后一只狼触发**最终刀人决策**（2163-2165 行），`nonWolfTargets` 正确排除全部狼队（含石像鬼，因 `WOLF_ROLES` 含 `STONE_GHOST`）✅
- **三级兜底**（HEAD 已修复，原为"静默随机反共识"）：
  1. 模型给合法 `actionTarget` → 直接用（2172-2175）
  2. 漏填 → 从本轮狼聊解析多数刀口 `extractWolfChatTarget`（2183-2192）
  3. 仍解析不出 → 静默重试只补 `actionTarget`（2195-2216）
  4. 最终失败 → 随机 + **可追溯播报**"上帝替狼队指定 X 号"（2219-2239）
- `wolfChatTarget.ts` 的 `KILL_INTENT` 只识别"刀/杀/带走/猎…X号"杀伤动词，不会把"6号跳预言家"误当刀口 ✅
- `wolfExplodeTarget`（自爆指刀）能正确传递到当晚狼刀消费 ✅

#### 狼王（WOLF_KING）✅ 基本正确，有一处 P1 疑点
- 放逐/夜晚死亡可开枪：正确（engine 2989 / 2571-2576 走 beginDeathActions）
- 毒死默认禁枪：正确（`rules.ts:64-66`，默认 `wolfKingCanShootWhenPoisoned=false`）
- ⚠️ **G-1（P1）**：`rules.ts:59-63` 狼王 `eligibleDeath` 含 `DEAD_SHOOT`，但猎人 `DEAD_SHOOT`（71 行）**不含**。即**猎人开枪带走狼王后，狼王还能回枪**。
  - 这是否 bug：**取决于设计意图**。`game-rules.test.ts:150-158` 有单测明确断言"狼王在被枪杀(DEAD_SHOOT)时仍开枪"，说明当前是**有意设计**。
  - 但 `rules.ts:57` 注释写"狼王被毒…不能开枪，**与猎人同规**"，与实现（狼王比猎人多允许 DEAD_SHOOT）**矛盾**。
  - 建议：确认产品意图。若标准狼王板应"被枪杀不可回枪"，需修改 `rules.ts`（但从"不改代码"委托看，仅标记）。

#### 狼人自爆（WOLF_EXPLODE，3512-3601 行）✅ 正确
- 触发条件 `shouldOfferWolfExplosion`（`rules.ts:155-162`）：enabled + 当日未问 + 存在可爆狼，正确
- 石像鬼不可自爆（`canWolfSelfExplode` 排除 STONE_GHOST，`rules.ts:27-30`）✅
- 血月使徒自爆封神职：完整（3582-3585 置 `bloodMoonSealed`，覆盖预言家/女巫/守卫/守墓人/猎魔人/商人所有夜间技能，`DAY_ANNOUNCE` 结算后重置 2526）✅
- 白狼王自爆带刀（3564-3579）：✅
- 双爆吞警徽：逻辑正确（对旧值 `explodedWolves` 判定，因两次自爆必在不同回合）✅

#### 石像鬼（STONE_GHOST，3228-3261 行）✅ 正确
- 单局单次，查验任意存活者（排除自身）的精确身份 ✅
- 不参与狼刀、时间在狼人闭眼后预言家前 ✅
- ⚠️ **G-4（P2）**：当狼队只剩石像鬼（夜间讨论 wolves.length===0，2128-2143），该分支只播报睁眼闭眼、**从不设 wolfTarget 也无指刀**。因石像鬼计入 wolvesCount，好人无法靠狼全灭获胜，只能投出石像鬼，形成偏长的残局。属规则意图待确认。

#### 血月使徒 ✅ 正确
封印实现完整、时序正确（见自爆节）。

### 4.2 好人神职

#### 预言家（SEER_ACTION，2275-2328 行）✅ 正确
- 每晚验人、`seerCheck` 存储与反馈正确；目标集合排除预言家自己（2308 行）
- 验人结果仅对预言家可见（信息隔离见 4.4）

#### 女巫（WITCH_ACTION，2333-2432 行）✅ 正确
- 自救规则：`witchSelfSave` 支持 `true / 'FIRST_NIGHT' / undefined`（与 `getVisibleGodStateForPlayer` 的 `canUseCure` 公式一致，858-864 行）✅
- 解药/毒药、一药一瓶、首夜自救、被拒时通知且不扣药 ✅
- 血月封印时跳过用药 ✅
- 女巫知道自己得到商人毒药技能（2345-2368）：正确处理
- ✓（验证）女巫决策可见信息只含 `wolfTarget/witchSave/witchPoison/canUseCure`，**不含验人结果**（865-872 行）

#### 守卫（GUARD_ACTION，2435-2496 行）✅ 正确
- 守人、相同守护限制、`guardProtect/lastGuardProtect`
- 血月封印时不可守 ✅

#### 猎魔人（DEMON_HUNTER_ACTION，3297-3341 行）✅ 正确
- 猎狼 → 狼死；猎好人 → 猎魔人自己死（3299-3328）
- `demonHunterKills` 记录、血月封印时不可猎 ✅

#### 骑士（KNIGHT_CHALLENGE，3403-3510 行）✅ 正确
- 决斗狼 → 狼死；决斗好人 → 骑士自己死（3436-3478）
- 决斗致死不触发猎人开枪（3441-3448 显式注释）✅
- `knightChallenged` 全局一次性，决斗后进入自爆判定/讨论 ✅

#### 丘比特（CUPID_LINK，3169-3222 行）✅
- 首夜连结（NIGHT_START 2094-2110 先于所有夜间行动）；连结对象不含丘比特自己（3174 行，修复后）
- 殉情 `handleLoverMartyrdom` 在死亡结算中正确串联（2543-2552 / 3098 / 3443 等）
- 跨阵营情侣 `cupidIsThirdParty` 第三方判定（`checkWinCondition` 173-191）✅

#### 奇迹商人（MERCHANT_ACTION，3343-3399 行）✅ 已修复
- 发技能（check/poison/guard）、发给狼人商人自己死（3367-3375）
- **技能类型缺失不再静默失败**（3382-3385 兜底日志）✅
- 技能经 `godState` 跟踪，对应阶段由持技者触发（2345/2447/useGameEngine 各分支）

#### 守墓人（GRAVEKEEPER_ACTION，3263-3294 行）✅ 正确
- 查验 `lastExiledPlayerId`（上一轮被放逐者）身份
- 血月封印/无放逐时正确提示

#### 猎人 / 狼王开枪（HUNTER_ACTION，3022-3134 行）✅ 正确
- 开枪选择、压枪、警徽流传递（3081-3096）、殉情、连锁死亡技能（3107-3119）
- 被毒禁枪：通过 `canPlayerUseDeathAction` 正确处理

### 4.3 好人平民与主流程

#### 天白流程编排（continueDayFlow，1801-1880 行）✅ 正确
- 顺序：首夜遗言 → 警长竞选 → 骑士决斗 → 狼人自爆 → 白天发言
- 各守卫条件正确、无死循环

#### 遗言（LAST_WORDS，3136 行）✅ 正确
- 首夜死亡触发（`firstNightLastWords`）、`lastWordsFromNight` 标记

#### 警长竞选 → 退水 → 警长投票（2640-2800 行）✅ 正确
- 竞选发言（SHERIFF_ELECTION）、退水（SHERIFF_WITHDRAW 3638-3781）、警长投票（SHERIFF_VOTING 2673-2800）
- **退水循环**：遍历 `sheriffCandidates`（含跳过死亡候选），0人→无警长 / 1人→当选 / 多人→进投票。**HEAD 实跑正常**（10 位存活候选人全部问到、无重复、无缺失）
- **警长 PK**（sheriffVoteRound=2）：PK 玩家不能投自己（2692-2694），多轮 PK 后警徽流失（2752）

#### 放逐投票（VOTING，2806-3021 行）✅ 正确，但 PK 可弃票
- 加权投票（警长票权 `sheriffVoteWeight`）、平票重投、白痴免投、弃票处理
- `resolveExileVote`（rules.ts:127-153）平票时 `shouldRevote = tieRound===0`（只允许一次重投，第二次平票=平安日），有单测锁定（game-rules:172）
- ⚠️ **G-2（P1）**：平票 PK 轮仍允许弃票（`getAiVote`/`getTargetDecision` 可返回空 target，VOTING 2893 统计弃票）。PK 本意"只能投平票候选人"，允许弃票会让少数票决定出局（旧审计问题4，当前仍存在）。

#### 死亡宣告与结算（DAY_ANNOUNCE，2500-2591 行）✅ 正确
- 守卫/女巫守护判定、同守同救规则（`guardHealConflictKills`）、毒结算、猎魔人额外死亡
- 殉情、警徽流、死亡技能串联、胜负判断（先结算后判胜负）✅

#### 第二轮讨论（DISCUSSION_ROUND_TWO，3783-3813 行）✅ 正确
- 条件触发、补充发言、投票前自爆判定

#### 第三方阵营 ✅ 正确
- 跨阵营情侣 → `cupidIsThirdParty` → `checkWinCondition` 第三方优先判定
- 第三方存活到最后且占多数时胜利

### 4.4 信息可见性 / 防作弊 ✅ 正确
- `getVisibleLogsForPlayer`（833-835）：按 `l.visibleTo` 过滤日志，只给对应玩家发可见内容
- `getVisibleGodStateForPlayer`（846-943）：按角色返回各自应知信息：
  - 女巫：wolfTarget/witchSave/witchPoison/canUseCure + 商人技能（**无 seerCheck**）✅
  - 守卫/预言家/石像鬼/守墓人/丘比特/猎魔人/骑士/商人各自的信息 ✅
  - 狼队能看到其他狼的角色；情侣互为可见 ⚠️（设计如此）
- ✓ 复验：`2026-09-13` 调试日志中"女巫毒 1 号（狼）"经核实为**盲毒**——女巫可见信息里并无验人结果，`visibleTo:[4]` 只给了预言家。**非信息泄露 bug**。

### 4.5 结算与评分 ✅ 正确
- `finalGodState = jotaiStore.get(godStateAtom)`（701 行）在结算时读取**最新**状态，修正了旧 Bug2（结算读到过期警长）✅
- `calcScore`（640-677）：生存 + 胜利 + 投票准确率 + 技能 + 发言活跃，MVP/SVP 标记

---

## 五、现存问题明细

### G-1｜狼王被枪杀后可回枪（P1 · 规则意图待确认）
- **位置**：`src/game/rules.ts:59-63`
- **现象**：狼王 `eligibleDeath` 含 `DEAD_SHOOT`，猎人开枪带走狼王 → 狼王可再回枪带走一人，形成"猎人→狼王→目标"二次带走链。猎人本身被枪杀则不能回枪（rules.ts:71 不含 DEAD_SHOOT）。
- **判断**：`game-rules.test.ts:150-158` 有单测锁定"狼王被枪杀也开枪"，说明是**有意设计**。但注释"与猎人同规"（rules.ts:57）与实现矛盾。
- **建议**：请产品/规则负责人确认意图。若标准狼王板应"被枪杀不可回枪"，移除 `rules.ts:62` 的 `DEAD_SHOOT` 并同步改测试；若保留则澄清注释。

### G-2｜平票 PK 允许弃票（P1）
- **位置**：`useGameEngine.ts:2893`（配合 `getAiVote`/`getTargetDecision` 允许空 target）
- **现象**：进 PK 重投时合法目标限定为平票候选人，但 AI/人类可弃票。8 票里 4 票弃票时，2 票即可淘汰一人（旧审计"问题4"，当前仍存在）。
- **建议**：`tieRound > 0` 时禁用弃票选项，强制在平票候选人中投票。

### G-3｜GOD-loop 无 catch（P2 · 健壮性）
- **位置**：`useGameEngine.ts:3821-3823`（`try { switch } finally {}` 无 `catch`）
- **现象**：若 switch 内任一 async 步骤抛异常，异常向上传播走 finally 重置 `engineStepInFlightRef`，但 **switch 在中间中断**，无人补 log/无重试。若异常后又有状态相关依赖触发 effect 重跑，可能造成阶段重入/卡死（历史日志中退水重复的疑似根因之一）。
- **建议**：给 GOD-loop 的 `try/catch` 补捕获，异常时写一条系统日志并尝试安全恢复（reset 到可恢复阶段）。

### G-4｜仅剩石像鬼时狼方无刀且扣胜利（P2 · 规则意图待确认）
- **位置**：`useGameEngine.ts:2128-2143`
- **现象**：狼队只剩石像鬼时，夜间无狼刀、不设 wolfTarget，且石像鬼计入 wolvesCount → 好人无法靠狼全灭获胜，只能投出石像鬼，形成长残局。
- **建议**：确认产品意图。若石像鬼"单飞"仍需能刀人/或被归入特殊判定，需调整；否则作为设计接受。

### G-5｜联机等待超时硬编码 120 秒（P2 · 配置项）
- **位置**：`src/multiplayer/constants.ts:4`（`HUMAN_INPUT_TIMEOUT_MS = 120_000`）
- **现状**：联机座位等待**倒计时 UI 已补**（`HumanInputPanel.tsx:248-261`），但超时时长仍硬编码，未做成可配置。
- **建议**：做成可配置项。

### G-6｜狼人自爆开关不一致：UI 开关开了但自爆仍不生效（P1 · 源码确认）
- **位置**：`useGameEngine.ts:493`、`types.ts:490`、`SettingsView.tsx:945-951`
- **根因**：引擎统一判断 `isWolfExplodeEnabled = () => !!config.rules.wolfSelfExplode && !!config.rules.wolfExplodeEnabled`（**两个都要 true**）。`wolfSelfExplode` 是旧字段（默认 `false`，`types.ts:490`），`wolfExplodeEnabled` 是新开关（默认 `true`）。**UI 的「狼人自爆」Toggle 只绑定 `wolfExplodeEnabled`**（`SettingsView.tsx:949-951`），从不暴露 `wolfSelfExplode`。
- **现象**：用户用**默认配置**开局，即使打开 UI 的「狼人自爆」开关，因 `wolfSelfExplode` 仍为 `false`，**自爆始终不生效**（配了=没配）。各预设板已手动设 `wolfSelfExplode:true`（`types.ts:533/555/578/600`），只有默认配置和手动自定义会踩坑。
- **建议**（三选一）：① UI 增加绑定 `wolfSelfExplode` 的主开关；② 引擎改为只依赖 `wolfExplodeEnabled`，移除旧字段依赖；③ 让默认配置的 `wolfSelfExplode` 与 `wolfExplodeEnabled` 一致设 true。

### G-7｜`doubleExplodeNoSheriff` 定义但从未实现（P2 · 源码确认）
- **位置**：`types.ts:343/491`（+ `533/556/579/601` 等预设设 true）
- **现象**：`doubleExplodeNoSheriff`（"双爆后不进行警长选举"）在类型与多个预设中设置，但 `useGameEngine.ts` **全文件无任何判断**，UI 也无该 toggle（只有已实现的 `doubleExplodeSwallowBadge`"双爆吞警徽流失" `SettingsView.tsx:966-969`）。该规则**永不生效**。
- **建议**：若需支持，在警长竞选前检查"已有两次自爆 + 规则开启 → 跳过竞选"；否则从配置与预设中移除该选项，避免误导用户。

---

## 5.5 子代理复核发现的规则口径观察（P2 · 多为设计待澄清，非显性 bug）

> 四路子代理（狼方/神职/平民与流程/配置结算）对全部角色与流程做并行的独立交叉复核后，除上述 G-1~G-7 外，再确认以下规则口径 / 边界小瑕，均 **P2**：

### 神职类
- **女巫毒药误锁（P2）**：`useGameEngine.ts:2386` — `canUsePoison = !!wantsPoison && (!result.useCure || witchSameNight)`。若 AI 声称用解药但实际被拒（自救限制/无解药），`result.useCure` 仍为真会把毒药一并锁死不扣。建议改用实际生效的 `canUseCure` 判定。
- **丘比特可自我连结（P2）**：`useGameEngine.ts:3174` — `targetIds = players.filter(isEffectivelyAlive)` **未排除丘比特自己**（预言家/守卫等其他 role 的 targetIds 均用 `p.id !== self` 排除）。前两个候选都可选丘比特自己。建议加 `p.id !== cupid.id`。
- **猎魔人无弹药上限（P2）**：`useGameEngine.ts:3322` — `demonHunterKills` 仅记录不做次数限制，无"单角色最多猎杀 X 次"配置。属板子口径待确认。
- **骑士"放弃"不置位（P2）**：`useGameEngine.ts:3409-3434` — `knightChallenged` 仅在有实际决斗目标时置位；若骑士放弃，次日仍可再决斗（符合"一次自选时机"板子语义，可与板子确认）。
- **奇迹商人语义待澄清（P2）**：`useGameEngine.ts:3343-3398` — `merchantSkillUsed` 实为"技能持有者已用"而非"商人日预算"；发给狼人致商人死亡延迟到 DAY_ANNOUNCE 结算而非即时。均为设计选择，逻辑无误。

### 流程 / 规则口径类
- **放逐 PK 第二轮投票范围（P2）**：`useGameEngine.ts:2913` — 进入重投时 `validTargetIds` 仍为**全存活者**，未限定为平票候选人；标准 PK 规则常要求"只能投平票者"。`resolveExileVote` 本身正确（首次平票才重投、二次平票=平安日，二次不重投不随机），此点仅为 PK 投票对象范围的规则口径偏差。
- **第三方胜利宽松度（P2）**：`rules.ts:176-185` — 第三方存活计数取 `alive` 中丘比特+情侣的**子集**（death 成员不计数也不阻断），若三者中一人已死、另两人存活且过半仍判第三方胜。若按"三方须全活才胜"则较宽松。属规则口径差异。
- **死亡狼私聊可见性理论风险（P2）**：`src/game/visibility.ts:57` — `isWolfPrivateLog` 的逻辑在"一只狼死亡后狼私聊可见性"上理论上存在未过滤风险，但引擎各私聊 `addSystemLog` 均显式传 `visibleTo`,**当前未发现实际泄漏路径**。
- **退水依赖模型字面字段（P2）**：`useGameEngine.ts:3649-3652` — `shouldWithdraw` 依赖返回的 `action==='withdraw'` / `shouldWithdraw===true` 字段，若模型不返回该字面字段会误判为"坚持竞选"。属提示词健壮性问题。
- **遗言未校验死亡态（P2）**：`useGameEngine.ts:3136-3165` — 对 `speakingQueue` 内 sid 未二次校验是否真处于可遗言死亡态，仅凭 queue 内容。当前所有 setQueue 均为死者 id，仅防御性建议。

---

## 六、发布前建议补充的回归用例

1. **屠边边界**：已有 `win-condition-slaughter-side`；建议补"屠神（神边全灭但民边存活）→ 狼胜"的正用例（当前只有屠民）。
2. **PK 强制投票**：为 G-2 补"PK 轮禁弃票"用例。
3. **狼王被枪杀回枪**：为 G-1 补"猎人开枪带走狼王"的端到端用例，固化/调整设计意图。
4. **仅剩石像鬼**：为 G-4 补"狼队只剩石像鬼"的无刀场景，固化设计。
5. **退水循环**：补"退水 for 遍历全部存活候选，无重复无缺失"的引擎回归（防历史退水 bug 回归，当前 HEAD 通过）。
6. **血月封印**：补"血月使徒自爆后当晚所有神职技能被封印"的用例。
7. **GOD-loop 异常恢复**：补"某阶段抛异常后仍能恢复而非卡死"的用例。
8. **女巫毒药误锁（5.5）**：补"解药被拒后毒药不应被误锁"的用例，断言 `canUsePoison` 用实际生效的 `canUseCure`。
9. **丘比特自我连结（5.5）**：补"丘比特不能再选自己为连结对象"的用例。
10. **放逐 PK 投票范围（5.5）**：补"PK 第二轮投票对象仅限平票候选人"的用例（固化或收紧 `validTargetIds`）。
11. **狼人自爆开关（G-6）**：补"默认配置打开 UI 自爆开关后自爆真正生效"的用例（修复后防回归）。
12. **第三方胜利口径（5.5）**：补"丘比特/情侣之一离场时第三方是否仍可胜"的预期用例，固化规则口径。

---

## 附：本审计边界

- 仅覆盖单机/AI 托管引擎路径；纯人类手动流程依赖相同 GOD-loop，结论基本适用。
- 联机对战（MultiplayerView）的服务端状态同步、房间发现等不在本次引擎审计范围。
- `checkWinCondition` 不做改动（用户已确认屠边 OR 正确）。
- 本报告**未修改任何源代码**。

---

### 审计覆盖度说明
本报告为**全量引擎审计**，整合了：
- 独立逐行核对 `rules.ts`（全部纯函数）与 `useGameEngine.ts`（每个 `case GamePhase` 分支），涉及全部 16 个角色（狼人/村民/预言家/女巫/守卫/猎人/白痴/狼王/骑士/石像鬼/白狼王/血月使徒/守墓人/猎魔人/丘比特/奇迹商人）与全部流程（狼刀/遗言/警长竞选/退水/放逐投票/PK/自爆/殉情/第三方/屠边/结算/评分）。
- 四路子代理并行交叉复核（狼方/神职/平民流程/配置结算），本文档已归档其全部发现。
- 真实对局复现（Playwright + mock LLM，血月使徒局）：退水、竞选、投票等关键流程实际跑通。
- 现有单测基准（`game-rules.test.ts` 20 例、`win-condition-slaughter-side`、`wolf-chat-target`、`replay-deaths`）。

最终结论：**引擎核心规则与流程实现正确，无 P0 级问题；存在 2 个 P1（G-1 狼王被枪杀回枪设计待确认、G-6 自爆开关配置失效）+ 5 个 P2（G-2~G-5、G-7）+ 若干 P2 规则口径观察**，已全部列明并给出修复/确认建议，均**未改动源码**。

---

## 七、修复记录（2026-09-14，审计同日）

> 本节为审计后当日的修复补充。前文行号仍对应审计基线 `a297be8`；本节行号以修复后工作区为准。

### 已修复

| 编号 | 结论 | 修复方式 |
|---|---|---|
| G-2 | ✅ 已修复 | 新增纯函数 `enforcePkVoteTarget`（`src/game/rules.ts`）：PK 轮空票/无效票强制改投平票候选人；引擎 VOTING 阶段接入（`useGameEngine.ts` `enforcedResults`，约 2829-2841 行），被强制改投者在逐票明细与策略日志中标注「PK轮强制改投」；`HumanInputPanel.tsx` 在 PK 轮（`voteTieCandidates` 非空）隐藏弃票按钮、提交时兜底拦截、目标按钮仅显示平票候选人。新增单测 `game-rules.test.ts: exile PK forbids abstention...` |
| G-3 | ✅ 已修复 | GOD-loop `try/finally` 补 `catch`（`useGameEngine.ts:3838`）：异常写 `console.error` + 系统日志并 `setIsAuto(false)` 暂停自动推进，等待人工恢复；不再产生未处理的 Promise 拒绝，也不做自动重入（避免半执行阶段重复结算） |
| G-6 | ✅ 已修复（方案②） | `isWolfExplodeEnabled` 改为仅依赖 `wolfExplodeEnabled`（`useGameEngine.ts:495`）；`WerewolfSkill.ts` 游戏规则提示词同步为单一开关；`types.ts` 将 `wolfSelfExplode` 标注为已废弃（保留字段兼容旧存档）。**注意**：修复后默认配置的实际行为与 UI 开关显示一致（开）——此前默认配置因 `wolfSelfExplode:false` 实际为关闭 |
| 5.5 女巫毒药误锁 | ✅ 已修复 | `canUsePoison` 改为按「实际生效的解药」（`canUseCure && result.useCure`）锁毒（`useGameEngine.ts:2389`）：AI 声称用解药但被规则拒绝时不再误锁毒药 |
| 5.5 丘比特自我连结 | ✅ 已修复 | `CUPID_LINK` 连结对象集合排除丘比特自己（`useGameEngine.ts:3187` 附近），与其他夜间行动排除自身的口径一致，也避免了第三方计数中丘比特被重复统计的问题 |

### 核实修正

- **5.5「放逐 PK 第二轮投票范围」为过期结论**：当前基线代码进入重投时 `validTargetIds = tiedIds.filter(...)`（原 2817-2819 行）**已限定为平票候选人**，无需修改；真实缺口仅是「允许弃票」，随 G-2 修复关闭。
- **审计正文建议补充的用例 1（屠神正用例）已存在**：`game-rules.test.ts` 第 41-52 行即「最后一名神职死亡 → 狼胜（ALL_GODS_DEAD）」。

### 保持不动（需产品/规则决策）

- **G-1 狼王被枪杀回枪**：单测锁定为有意设计，与 `rules.ts:57` 注释矛盾。需确认意图后二选一：改实现（移除 `DEAD_SHOOT` 并同步测试）或改注释。
- **G-4 仅剩石像鬼无刀**：规则意图待确认，当前实现保留。
- **G-5 联机等待超时硬编码 120s**：`HUMAN_INPUT_TIMEOUT_MS` 已被引擎与倒计时 UI 共用，做成可配置项属功能增强，未在本次改动。
- **G-7 `doubleExplodeNoSheriff` 未实现**：复核发现警长竞选仅发生在第一天且先于一切自爆窗口（`continueDayFlow` 顺序：遗言 → 竞选 → 决斗 → 自爆 → 发言），引擎本就不存在「双爆后再选举」路径——该规则的需求场景在当前流程下不存在。建议后续做配置清理（从类型/预设移除该字段），或在未来引入警徽重选机制时再实现。
- **5.5 其余口径观察**（第三方胜利宽松度、猎魔人无弹药上限、骑士放弃不置位、商人语义、退水字段依赖、遗言防御校验）：设计选择/防御性建议，未改动。

### 验证

- `npm run typecheck` 通过。
- `npm test`：**172/172 通过**（含新增「exile PK forbids abstention」用例）。