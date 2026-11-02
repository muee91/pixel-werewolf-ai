/**
 * 模型混搭面板（电子斗蛐蛐）
 *
 * 数据层早就支持"一格一模型"（ActorProfile.llmPresetId），但要把 3 个模型铺到 9 个分身上，
 * 得进 9 次编辑页各选一遍。这里给一个"选模型 → 一口气铺开"的入口。
 *
 * 只改 llmPresetId，不碰声音、人设、名字——混搭是"换大脑"，不是"换人"。
 */
import { useMemo, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { actorProfilesAtom, globalApiConfigAtom, llmPresetsAtom } from '../../../store';
import { buildModelMix, summarizeMix, type MixMode } from '../../../utils/modelMix';
import { ActionButton } from '../../ui/pixel';

export const ModelMixPanel = ({ embedded = false }: { embedded?: boolean } = {}) => {
    const [actors, setActors] = useAtom(actorProfilesAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const [apiConfig] = useAtom(globalApiConfigAtom);

    const players = actors.filter(a => a.id !== apiConfig.narratorActorId);
    const configured = llmPresets.filter(p => (p.name || p.modelId).trim().length > 0);

    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<string[]>(() => configured.map(p => p.id));
    const [lastAction, setLastAction] = useState<string>('');

    const labelOf = (presetId: string) => {
        const preset = llmPresets.find(p => p.id === presetId);
        return preset?.name || preset?.modelId || presetId;
    };

    const current = useMemo(() => {
        const assignment: Record<string, string> = {};
        players.forEach(p => { if (p.llmPresetId) assignment[p.id] = p.llmPresetId; });
        return summarizeMix(assignment, labelOf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [players, llmPresets]);

    const toggle = (presetId: string) => {
        setSelected(prev => prev.includes(presetId) ? prev.filter(id => id !== presetId) : [...prev, presetId]);
    };

    const apply = (mode: MixMode) => {
        const assignment = buildModelMix({ actorIds: players.map(p => p.id), presetIds: selected, mode });
        if (Object.keys(assignment).length === 0) {
            setLastAction('先勾选至少一个模型');
            return;
        }
        setActors(prev => prev.map(actor => (
            actor.id === apiConfig.narratorActorId || !assignment[actor.id]
                ? actor
                : { ...actor, llmPresetId: assignment[actor.id] }
        )));
        setLastAction(mode === 'rotate'
            ? `已轮流铺开：${selected.length} 个模型分给 ${players.length} 个分身`
            : `已随机铺开：${selected.length} 个模型分给 ${players.length} 个分身`);
    };

    const tooFew = configured.length < 2;

    // embedded：并入「玩家列表」那张两行表当第二行，不再自带外框与底部外边距
    return (
        <div className={embedded ? 'p-4' : 'rounded-none border-[3px] p-4 mb-4'} style={embedded ? undefined : { background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <span className="text-sm font-bold block" style={{ color: 'var(--color-fg)' }}>模型混搭（电子斗蛐蛐）</span>
                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                        当前：{current}
                        {tooFew && ' · 只配置了一个模型，混不出对手'}
                    </span>
                </div>
                <ActionButton variant="ghost" size="sm" onClick={() => setOpen(v => !v)}>{open ? '收起' : '混搭'}</ActionButton>
            </div>

            {open && (
                <div className="mt-3 space-y-3">
                    <div>
                        <div className="text-xs font-bold mb-1.5" style={{ color: 'var(--color-muted)' }}>参与混搭的模型</div>
                        <div className="flex flex-wrap gap-2">
                            {configured.map(preset => {
                                const active = selected.includes(preset.id);
                                return (
                                    <button
                                        key={preset.id}
                                        onClick={() => toggle(preset.id)}
                                        className="text-xs px-2 py-1 border-[3px] font-bold"
                                        style={{
                                            background: active ? 'var(--color-accent1)' : 'var(--color-bg)',
                                            color: active ? 'var(--color-bg)' : 'var(--color-accent1)',
                                            borderColor: active ? 'var(--color-accent1)' : 'var(--color-border)',
                                        }}
                                    >
                                        {preset.name || preset.modelId}
                                    </button>
                                );
                            })}
                            {configured.length === 0 && (
                                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>还没有配置模型，先去「模型」页添加</span>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <ActionButton onClick={() => apply('rotate')}>轮流铺开</ActionButton>
                        <ActionButton variant="ghost" onClick={() => apply('random')}>随机铺开</ActionButton>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
                        {lastAction || '只改"用哪个大脑"，不动声音、人设与名字；上帝(旁白)不参与混搭。'}
                    </div>
                </div>
            )}
        </div>
    );
};
