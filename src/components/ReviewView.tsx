import React, { useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { clsx } from 'clsx';
import {
    appScreenAtom,
    actorProfilesAtom,
    gameResultAtom,
    llmPresetsAtom,
    logsAtom,
    playersAtom,
    reviewArchiveAtom,
} from '../store';
import { GameArchive, GamePhase, WOLF_ROLES } from '../types';
import { getPlayerModelLabel, HUMAN_MODEL_LABEL } from '../utils/modelLabels';
import { buildGameReview, getReviewHeadline, type ReviewDay, type ReviewSeat } from '../utils/reviewModel';
import { normalizeGameArchive } from '../utils/archive';
import { VOXEL_TOKENS as T } from '../themes/voxel-tokens';
import { CampSpriteCanvas } from './game/voxel/primitives';

/**
 * 复盘页：把一局摊开成"谁是谁 / 说了什么 / 怎么投的"。
 *
 * 只读——不碰回放用的 replaySourceLogs，从历史进来也不会动正在进行的对局。
 * 入口三个：结算面板、历史对局卡、3D 房间的「更多」菜单。
 */

const CAMP_STYLE = (isWolf: boolean) => (isWolf
    ? { background: T.redstoneInk, color: T.paper }
    : { background: T.emerald, color: T.ink });

const PHASE_TONE: Partial<Record<GamePhase, string>> = {
    [GamePhase.DAY_DISCUSSION]: T.emerald,
    [GamePhase.DISCUSSION_ROUND_TWO]: T.emerald,
    [GamePhase.SHERIFF_ELECTION]: T.diamond,
    [GamePhase.LAST_WORDS]: T.redstone,
    [GamePhase.HUNTER_ACTION]: T.redstone,
    [GamePhase.VOTING]: T.torch,
    [GamePhase.SHERIFF_VOTING]: T.torch,
};

const seatTone = (phase: GamePhase) => PHASE_TONE[phase] ?? T.paper;

const formatMs = (ms: number | null) => {
    if (ms == null) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
};

const ModelChip = ({ label }: { label: string }) => {
    if (!label) return null;
    const isHuman = label === HUMAN_MODEL_LABEL;
    return (
        <span
            className="inline-flex shrink-0 items-center border-2 px-1.5 py-0.5 text-xs font-black"
            style={{ borderColor: T.ink, background: isHuman ? T.paper : T.stoneDark, color: isHuman ? T.ink : T.paper }}
            title={isHuman ? '这张牌由真人操作' : `模型：${label}`}
        >
            {isHuman ? '🕹' : '🧠'} {label}
        </span>
    );
};

const SeatCard = ({ seat }: { seat: ReviewSeat }) => (
    <div
        className="flex min-w-0 flex-col gap-1 border-[3px] p-2 shadow-[3px_3px_0_var(--voxel-ink)]"
        style={{
            borderColor: T.ink,
            background: seat.alive ? T.paper : T.deadCard,
            color: seat.alive ? T.ink : T.deadText,
        }}
    >
        <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-black">
                <span className="inline-flex h-5 w-5 items-center justify-center border-2" style={{ background: T.woodDark, borderColor: T.ink, color: T.paper }}>
                    {seat.seatNumber}
                </span>
                <span className="min-w-0 truncate" title={seat.name}>{seat.name}</span>
            </span>
            <span className={clsx('shrink-0 border-2 px-1.5 py-0.5 text-xs font-black')} style={{ borderColor: T.ink, ...CAMP_STYLE(WOLF_ROLES.includes(seat.role)) }}>
                {seat.roleLabel}
            </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
            <ModelChip label={seat.model} />
            <span className="border-2 px-1.5 py-0.5 text-xs font-bold" style={{ borderColor: T.ink, background: seat.alive ? T.grassDark : T.redstoneInk, color: seat.alive ? T.ink : T.paper }}>
                {seat.outReason}
            </span>
        </div>
    </div>
);

const DayCard = ({ day, defaultOpen }: { day: ReviewDay; defaultOpen: boolean }) => {
    const [open, setOpen] = useState(defaultOpen);
    const speakerCount = day.speeches.length;
    return (
        <section className="border-[4px] shadow-[5px_5px_0_var(--voxel-ink)]" style={{ background: T.paperDim, borderColor: T.ink, color: T.ink }}>
            <button
                type="button"
                onClick={() => setOpen(value => !value)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-2 border-b-[3px] px-3 py-2 text-left"
                style={{ borderColor: open ? T.ink : 'transparent', background: T.woodDark, color: T.paper }}
            >
                <span className="flex items-center gap-2 text-sm font-black">
                    <span className="border-2 px-1.5 py-0.5 text-xs" style={{ background: T.torch, borderColor: T.ink, color: T.ink }}>
                        DAY {day.turn}
                    </span>
                    <span className="opacity-90">{speakerCount} 条发言 · {day.votes.length} 次投票</span>
                </span>
                <span aria-hidden="true" className="text-xs font-black opacity-80">{open ? '收起 ▲' : '展开 ▼'}</span>
            </button>
            {open && (
                <div className="space-y-3 p-3">
                    {day.votes.map(round => (
                        <div key={round.key} className="border-[3px] p-2" style={{ borderColor: T.ink, background: T.paper }}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-black">{round.label}</span>
                                <span className="flex flex-wrap items-center gap-1 text-xs font-black">
                                    {round.tally.map(item => (
                                        <span key={item.seatNumber} className="border-2 px-1.5 py-0.5" style={{ borderColor: T.ink, background: T.torch, color: T.ink }}>
                                            {item.seatNumber}号 {item.count}票
                                        </span>
                                    ))}
                                    {round.abstain > 0 && <span className="border-2 px-1.5 py-0.5 opacity-70" style={{ borderColor: T.ink }}>弃票 {round.abstain}</span>}
                                    {round.tiedSeats.length > 1 && <span className="border-2 px-1.5 py-0.5" style={{ borderColor: T.ink, background: T.redstoneInk, color: T.paper }}>平票</span>}
                                </span>
                            </div>
                            <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                {round.rows.map((row, index) => (
                                    <div key={`${round.key}-${row.voterSeat}-${index}`} className="flex min-w-0 items-center gap-1.5 border-2 px-1.5 py-1 text-xs font-bold" style={{ borderColor: 'color-mix(in srgb, var(--voxel-ink) 35%, transparent)' }} title={row.reason || undefined}>
                                        <span className="shrink-0 font-black">{row.voterSeat}号</span>
                                        <span aria-hidden="true" className="shrink-0 opacity-60">→</span>
                                        <span className="shrink-0 font-black" style={{ color: row.targetSeat == null ? T.inkSoft : T.redstoneInk }}>{row.targetSeat == null ? '弃票' : `${row.targetSeat}号`}</span>
                                        {row.weight !== 1 && <span className="shrink-0 border px-1" style={{ borderColor: T.ink }}>×{row.weight}</span>}
                                        {row.forced && <span className="shrink-0 opacity-70">PK改投</span>}
                                        {row.voterModel && <span className="min-w-0 truncate opacity-60">🧠{row.voterModel}</span>}
                                    </div>
                                ))}
                            </div>
                            {round.exiledSeat != null && (
                                <div className="mt-2 text-xs font-black" style={{ color: T.redstoneInk }}>
                                    → 本轮放逐 {round.exiledSeat} 号
                                </div>
                            )}
                        </div>
                    ))}

                    {day.speeches.length > 0 && (
                        <ol className="space-y-2">
                            {day.speeches.map(speech => (
                                <li key={speech.logId} className="border-[3px] p-2" style={{ borderColor: T.ink, background: T.paper }}>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="border-2 px-1.5 py-0.5 text-xs font-black" style={{ borderColor: T.ink, background: seatTone(speech.phase), color: T.ink }}>
                                            {speech.seatNumber}号 {speech.name}
                                        </span>
                                        <span className="text-xs font-bold opacity-60">{speech.phaseLabel}</span>
                                        <ModelChip label={speech.model} />
                                        <span className="ml-auto shrink-0 text-xs font-bold opacity-60">{speech.chars} 字 · {formatMs(speech.durationMs)}</span>
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-xs font-bold leading-relaxed">{speech.content}</p>
                                </li>
                            ))}
                        </ol>
                    )}

                    {day.events.length > 0 && (
                        <details className="border-[3px] p-2" style={{ borderColor: T.ink, background: T.woodDark, color: T.paper }}>
                            <summary className="cursor-pointer text-xs font-black">系统播报 {day.events.length} 条</summary>
                            <ul className="mt-2 space-y-1">
                                {day.events.map(event => (
                                    <li key={event.id} className="text-xs font-bold leading-snug opacity-90">
                                        <span className="opacity-60">[{event.phaseLabel}]</span> {event.text}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}

                    {day.speeches.length === 0 && day.votes.length === 0 && (
                        <div className="text-xs font-bold opacity-60">这一天没有留下公开内容。</div>
                    )}
                </div>
            )}
        </section>
    );
};

const ReviewView: React.FC = () => {
    const setScreen = useSetAtom(appScreenAtom);
    const setReviewArchive = useSetAtom(reviewArchiveAtom);
    const archiveRaw = useAtomValue(reviewArchiveAtom);
    const liveLogs = useAtomValue(logsAtom);
    const livePlayers = useAtomValue(playersAtom);
    const liveResult = useAtomValue(gameResultAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const presets = useAtomValue(llmPresetsAtom);

    // 存档要过一遍 normalize：老版本存档缺字段，直接读会在 buildGameReview 里炸
    const archive = useMemo<GameArchive | null>(
        () => (archiveRaw ? normalizeGameArchive(archiveRaw) : null),
        [archiveRaw],
    );

    const logs = archive?.logs ?? liveLogs;
    const players = archive?.players ?? livePlayers;
    const result = archive?.result ?? liveResult;

    const review = useMemo(() => buildGameReview({
        logs,
        players,
        result,
        labelOf: player => getPlayerModelLabel(player, actors, presets),
    }), [logs, players, result, actors, presets]);

    const headline = getReviewHeadline(result, archive?.winner ?? null);
    const isGoodWin = result ? result.winner === 'GOOD' : archive?.winner === 'GOOD';
    const back = () => {
        const fromArchive = !!archive;
        setReviewArchive(null);
        setScreen(fromArchive ? 'HISTORY' : 'GAME');
    };

    const modelStats = review.modelStats.filter(stat => stat.speeches > 0 || stat.votes > 0);
    const hasModelStats = modelStats.length > 0;

    return (
        // 整页用纸面底：标题是深墨色，压在主题深色底上会看不见（首版就踩过）
        <div className="vw-settings flex w-full flex-col overflow-hidden" style={{ height: '100dvh', background: T.paperDim, color: T.ink }}>
            <div className="sticky top-0 z-20 flex min-h-14 shrink-0 items-center gap-3 border-b-[3px] px-4 shadow-[3px_3px_0_var(--voxel-ink)]" style={{ background: T.woodDark, borderColor: T.ink, color: T.paper }}>
                <button
                    type="button"
                    onClick={back}
                    className="flex min-h-11 items-center border-[3px] px-3 text-xs font-black shadow-[3px_3px_0_var(--voxel-ink)] active:translate-y-[2px] active:shadow-none"
                    style={{ background: T.paper, borderColor: T.ink, color: T.ink }}
                >
                    ← {archive ? '历史对局' : '返回对局'}
                </button>
                <div className="min-w-0">
                    <div className="text-xs font-black tracking-[0.2em] opacity-80">赛后复盘</div>
                    <div className="truncate text-sm font-black">
                        {archive ? new Date(archive.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '当前这局'}
                        {' · '}
                        {review.seats.length} 人局
                    </div>
                </div>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-5xl space-y-4 p-4 pb-[calc(4rem+var(--safe-area-inset-bottom))]">
                <section className="border-[4px] shadow-[6px_6px_0_var(--voxel-ink)]" style={{ background: T.paperDim, borderColor: T.ink }}>
                    <div className="border-b-[3px] px-4 py-3" style={{ borderColor: T.ink, background: isGoodWin ? T.emerald : T.redstoneDeep, color: isGoodWin ? T.ink : 'var(--voxel-solid-white)' }}>
                        <div className="text-xs font-black tracking-[0.2em] opacity-80">结果</div>
                        <div className="mt-1 text-2xl font-black leading-tight">{headline.title}</div>
                        <div className="mt-1 text-xs font-bold leading-snug opacity-90">{headline.detail}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
                        {[
                            { label: '天数', value: result?.turn ?? (archive?.turnCount || review.days.length || 0) },
                            { label: '存活', value: `${review.seats.filter(seat => seat.alive).length}/${review.seats.length}` },
                            { label: '发言', value: review.totals.speeches },
                            { label: '投票', value: review.totals.votes },
                        ].map(item => (
                            <div key={item.label} className="border-[3px] px-2 py-1.5" style={{ borderColor: T.ink, background: T.paper }}>
                                <div className="text-xs font-black opacity-60">{item.label}</div>
                                <div className="text-lg font-black leading-none">{item.value}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {review.seats.length > 0 && (
                <section className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-black">阵容与模型</h2>
                        <span className="text-xs font-bold opacity-60">{review.seats.filter(seat => seat.isHuman).length > 0 ? '含真人座位' : '全 AI 座位'}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {review.seats.map(seat => <SeatCard key={seat.playerId} seat={seat} />)}
                    </div>
                </section>
                )}

                {hasModelStats && (
                    <section className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-black">模型战绩</h2>
                            {/* 每行数字已自带单位（次发言/字/字/次/票），表头再列一遍反而不一致 */}
                            <span className="text-xs font-bold opacity-60">同一模型的座位合并成一行</span>
                        </div>
                        <div className="border-[4px] p-2 shadow-[5px_5px_0_var(--voxel-ink)]" style={{ background: T.paperDim, borderColor: T.ink }}>
                            <div className="space-y-1">
                                {modelStats.map(stat => (
                                    <div key={stat.label} data-testid="model-stat" className="flex flex-wrap items-center justify-between gap-2 border-[2px] px-2 py-1" style={{ borderColor: T.ink, background: T.paper }}>
                                        <span className="flex min-w-0 items-center gap-1.5">
                                            <ModelChip label={stat.label} />
                                            <span className="truncate text-xs font-bold opacity-60" title={`座位 ${stat.seats.join('、')}`}>座位 {stat.seats.join('、')}</span>
                                        </span>
                                        <span className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs font-black">
                                            {[
                                                `${stat.speeches} 次发言`,
                                                `${stat.chars} 字`,
                                                `${stat.avgChars} 字/次`,
                                                formatMs(stat.avgDurationMs),
                                                `${stat.votes} 票`,
                                            ].map((text, i) => (
                                                <React.Fragment key={text + i}>
                                                    {i > 0 && <span aria-hidden="true" className="opacity-30">·</span>}
                                                    <span className={i === 0 ? undefined : 'opacity-70'}>{text}</span>
                                                </React.Fragment>
                                            ))}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                <section className="space-y-2">
                    <h2 className="text-sm font-black">逐日复盘</h2>
                    {review.days.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 border-[4px] p-6 text-center" style={{ borderColor: T.ink, background: T.paper }}>
                            <CampSpriteCanvas name="book" px={4} />
                            <div className="text-sm font-black">这局没有留下可复盘的日志</div>
                            <div className="text-xs font-bold opacity-60">可能是刚开始就结束了，或存档里只有结算记录。</div>
                        </div>
                    ) : review.days.map((day, index) => (
                        <DayCard key={day.turn} day={day} defaultOpen={index === review.days.length - 1} />
                    ))}
                </section>
                </div>
            </div>
        </div>
    );
};

export default ReviewView;
