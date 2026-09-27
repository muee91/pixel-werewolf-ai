import React from 'react';

type Props = {
    children: React.ReactNode;
    onReturnTo2D: () => void;
};

type State = {
    error: Error | null;
};

export class ThreeSceneErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error) {
        console.error('3D scene failed to render:', error);
    }

    private handleRetry = () => {
        window.location.reload();
    };

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <div className="flex h-[100dvh] w-full items-center justify-center bg-[#11180f] p-6 text-[#f2dfaa]">
                <div className="w-full max-w-md border-[4px] border-[#21150d] bg-[#4b2d1a] p-6 shadow-[8px_8px_0_#21150d]">
                    <div className="text-xs font-black tracking-[0.24em] text-[#f6b443]">WORLD RENDER FAILED</div>
                    <h2 className="mt-2 text-2xl font-black">3D 世界生成失败</h2>
                    <p className="mt-3 text-sm leading-relaxed text-[#d8cba8]">
                        当前设备或浏览器无法稳定运行 WebGL 场景。对局状态没有丢失，可以安全返回经典 2D。
                    </p>
                    <button
                        type="button"
                        onClick={this.handleRetry}
                        className="mt-5 w-full border-[3px] border-[#21150d] bg-[#f2dfaa] px-4 py-3 text-sm font-black text-[#24170e] shadow-[4px_4px_0_#21150d]"
                    >
                        刷新并重试 3D
                    </button>
                    <button
                        type="button"
                        onClick={this.props.onReturnTo2D}
                        className="mt-3 w-full border-[3px] border-[#21150d] bg-[#f6b443] px-4 py-3 text-sm font-black text-[#24170e] shadow-[4px_4px_0_#21150d]"
                    >
                        返回经典 2D
                    </button>
                </div>
            </div>
        );
    }
}
