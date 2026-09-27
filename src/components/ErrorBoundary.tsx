import React, { type ReactNode, type ErrorInfo } from 'react';

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

    private handleHardReset = () => {
        // 该操作会连带清除 API Key 与全部分身/存档配置,必须二次确认
        if (!window.confirm('确定清空全部本地数据吗?\n这将删除 API 配置、玩家分身与所有历史存档,且不可恢复。')) return;
        localStorage.clear();
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-white p-6">
                    <div className="max-w-md text-center space-y-6">
                        <div className="text-6xl">🐺</div>
                        <h1 className="text-2xl font-black text-red-400">游戏遇到了意外错误</h1>
                        <p className="text-sm text-slate-400 break-all">{this.state.error?.message || '未知错误'}</p>
                        <div className="flex gap-3 justify-center">
                            <button onClick={this.handleReload} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold transition-colors">刷新恢复</button>
                            <button onClick={this.handleHardReset} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition-colors">清空数据</button>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
