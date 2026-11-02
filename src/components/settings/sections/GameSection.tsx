import { useAtom } from 'jotai';
import { clsx } from 'clsx';
import { gameConfigAtom } from '../../../store';
import { Role } from '../../../types';
import { PixelIcon } from '../../game/voxel/primitives';
import { SectionLabel, Toggle } from '../../ui/pixel';

// 板子规则与白天流程,只依赖 gameConfig,无跨区耦合
// (朗读倍速属于"听感",已归入「声音」分区;TTS 开关与引擎同理)
export const GameSection = () => {
    const [gameConfig, setGameConfig] = useAtom(gameConfigAtom);

    return (
        <div className="space-y-6">
            <div>
                <SectionLabel>游戏规则</SectionLabel>
                <div className="rounded-none border-[3px] overflow-hidden" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                    <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <PixelIcon name="boom" px={3} style={{ color: "var(--color-fg)", marginTop: 2 }} />
                                <div>
                                    <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>狼人自爆</span>
                                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                                        狼人白天可自爆，跳过发言直接进入黑夜
                                        {!gameConfig.rules.wolfExplodeEnabled && (gameConfig.roles.includes(Role.WHITE_WOLF_KING) || gameConfig.roles.includes(Role.BLOOD_MOON_DISCIPLE))
                                            ? '；注意：当前板子含白狼王/血月使徒，关闭自爆后其「自爆带人/自爆封印」能力将失效'
                                            : ''}
                                    </span>
                                </div>
                            </div>
                            <Toggle value={gameConfig.rules.wolfExplodeEnabled} onChange={() => setGameConfig(prev => {
                                const next = !prev.rules.wolfExplodeEnabled;
                                return { ...prev, rules: { ...prev.rules, wolfExplodeEnabled: next, ...(!next && { doubleExplodeSwallowBadge: false }) } };
                            })} />
                        </div>

                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <PixelIcon name="badge" px={3} style={{ color: "var(--color-fg)", marginTop: 2 }} />
                                <div>
                                    <span className={clsx("text-sm font-bold block", (!gameConfig.rules.wolfExplodeEnabled || !gameConfig.sheriffEnabled) ? "opacity-40" : "")}
                                        style={{ color: 'var(--color-fg)' }}>双爆吞警徽</span>
                                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                                        {(!gameConfig.rules.wolfExplodeEnabled || !gameConfig.sheriffEnabled) ? "需先开启狼人自爆和警长规则" : "两名狼人连续自爆时，警徽流失"}
                                    </span>
                                </div>
                            </div>
                            <Toggle
                                value={gameConfig.rules.doubleExplodeSwallowBadge}
                                disabled={!gameConfig.rules.wolfExplodeEnabled || !gameConfig.sheriffEnabled}
                                onChange={() => gameConfig.rules.wolfExplodeEnabled && gameConfig.sheriffEnabled && setGameConfig(prev => ({ ...prev, rules: { ...prev.rules, doubleExplodeSwallowBadge: !prev.rules.doubleExplodeSwallowBadge } }))}
                            />
                        </div>

                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <PixelIcon name="sheriff" px={3} style={{ color: "var(--color-fg)", marginTop: 2 }} />
                                <div>
                                    <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>警长/警徽规则</span>
                                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>启用警长竞选，警长放逐票权重 1.5</span>
                                </div>
                            </div>
                            <Toggle value={gameConfig.sheriffEnabled} onChange={() => setGameConfig(prev => {
                                const next = !prev.sheriffEnabled;
                                return {
                                    ...prev,
                                    sheriffEnabled: next,
                                    rules: {
                                        ...prev.rules,
                                        sheriffElection: next,
                                        ...(!next && {
                                            doubleExplodeSwallowBadge: false,
                                            sheriffWithdrawEnabled: false,
                                        }),
                                    },
                                };
                            })} />
                        </div>

                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <PixelIcon name="vote" px={3} style={{ color: "var(--color-fg)", marginTop: 2 }} />
                                <div>
                                    <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>投票明细公开</span>
                                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>关闭时只显示投票结果</span>
                                </div>
                            </div>
                            <Toggle value={gameConfig.voteDetailPublic} onChange={() => setGameConfig(prev => {
                                const next = !prev.voteDetailPublic;
                                // 引擎文字层读顶层字段，3D 开票板与 AI 提示词读 rules 层，两处必须同步
                                return { ...prev, voteDetailPublic: next, rules: { ...prev.rules, voteDetailPublic: next } };
                            })} />
                        </div>

                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <PixelIcon name="chat" px={3} style={{ color: "var(--color-fg)", marginTop: 2 }} />
                                <div>
                                    <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>两轮讨论</span>
                                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>白天进行两轮发言讨论</span>
                                </div>
                            </div>
                            <Toggle value={gameConfig.rules.twoRoundDiscussion} onChange={() => setGameConfig(prev => ({ ...prev, rules: { ...prev.rules, twoRoundDiscussion: !prev.rules.twoRoundDiscussion } }))} />
                        </div>

                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <PixelIcon name="flag" px={3} style={{ color: "var(--color-fg)", marginTop: 2 }} />
                                <div>
                                    <span className={clsx("text-sm font-bold block", !gameConfig.sheriffEnabled ? "opacity-40" : "")}
                                        style={{ color: 'var(--color-fg)' }}>退水环节</span>
                                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                                        {!gameConfig.sheriffEnabled ? "需先开启警长规则" : "警长竞选者可选择退水放弃竞选"}
                                    </span>
                                </div>
                            </div>
                            <Toggle
                                value={gameConfig.rules.sheriffWithdrawEnabled}
                                disabled={!gameConfig.sheriffEnabled}
                                onChange={() => gameConfig.sheriffEnabled && setGameConfig(prev => ({ ...prev, rules: { ...prev.rules, sheriffWithdrawEnabled: !prev.rules.sheriffWithdrawEnabled } }))}
                            />
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
};
