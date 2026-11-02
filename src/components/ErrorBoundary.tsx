import React, { type ReactNode, type ErrorInfo } from 'react';
import { confirmDialog } from '../utils/notify';
import ConfirmDialogHost from './ConfirmDialogHost';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    public state: State = { hasError: false, error: null };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleHardReset = async () => {
        // 该操作会连带清除 API Key 与全部分身/存档配置,必须二次确认
        const ok = await confirmDialog('这将删除 API 配置、玩家分身与所有历史存档，且不可恢复。', {
            title: '清空全部本地数据？',
            confirmLabel: '清空数据',
            danger: true,
        });
        if (!ok) return;
        localStorage.clear();
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-screen flex items-center justify-center p-6"
                    style={{ background: 'var(--voxel-night-veil)', color: 'var(--voxel-paper)' }}>
                    <div className="max-w-md text-center space-y-6">
                        <div className="text-6xl">🐺</div>
                        <h1 className="text-2xl font-black" style={{ color: 'var(--voxel-redstone-on-dark)' }}>游戏遇到了意外错误</h1>
                        <p className="text-sm break-all" style={{ color: 'var(--voxel-paper-dim)' }}>{this.state.error?.message || '未知错误'}</p>
                        <div className="flex gap-3 justify-center">
                            <button onClick={this.handleReload} className="px-4 py-2 rounded-none border-[3px] font-bold transition-all hover:brightness-110 active:scale-[0.98]"
                                style={{ background: 'var(--voxel-torch)', color: 'var(--voxel-ink)', borderColor: 'var(--voxel-ink)', boxShadow: '3px 3px 0 var(--voxel-ink)' }}>刷新恢复</button>
                            <button onClick={this.handleHardReset} className="px-4 py-2 rounded-none border-[3px] font-bold transition-all hover:brightness-110 active:scale-[0.98]"
                                style={{ background: 'var(--voxel-wood-dark)', color: 'var(--voxel-paper)', borderColor: 'var(--voxel-ink)', boxShadow: '3px 3px 0 var(--voxel-ink)' }}>清空数据</button>
                        </div>
                    </div>
                    {/* App 崩溃时其内部的宿主已卸载,崩溃兜底界面里也要能弹应用内确认 */}
                    <ConfirmDialogHost />
                </div>
            );
        }
        return this.props.children;
    }
}
