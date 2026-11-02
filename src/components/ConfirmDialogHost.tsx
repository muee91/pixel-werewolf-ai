import React, { useEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import { confirmRequestAtom } from '../atoms';

// 全局应用内确认对话框：utils/notify.confirmDialog() 触发，App 挂载一次。
// 取代 window.confirm——倒计时、触屏与 WebView 环境下原生弹窗都不可控。
const ConfirmDialogHost: React.FC = () => {
    const [request, setRequest] = useAtom(confirmRequestAtom);
    const confirmRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!request) return;
        confirmRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setRequest(null);
                request.resolve(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [request, setRequest]);

    if (!request) return null;

    const close = (ok: boolean) => {
        setRequest(null);
        request.resolve(ok);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/70" onClick={() => close(false)} />
            <div
                role="alertdialog"
                aria-modal="true"
                aria-label={request.title || '请确认'}
                className="relative border-4 p-5 w-full max-w-md shadow-[8px_8px_0_var(--voxel-ink)]"
                style={{ background: 'var(--voxel-paper)', borderColor: 'var(--voxel-ink)', color: 'var(--voxel-ink)' }}
            >
                <div className="text-lg font-black mb-2">{request.title || '请确认'}</div>
                <p className="text-sm font-bold leading-relaxed whitespace-pre-line">{request.message}</p>
                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => close(false)}
                        className="border-[3px] px-4 py-2.5 text-sm font-black transition-all hover:brightness-110"
                        style={{ background: 'var(--voxel-paper-dim)', borderColor: 'var(--voxel-ink)', color: 'var(--voxel-ink)' }}
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        ref={confirmRef}
                        onClick={() => close(true)}
                        className="border-[3px] px-4 py-2.5 text-sm font-black transition-all hover:brightness-110"
                        style={request.danger
                            ? { background: 'var(--voxel-redstone-deep)', borderColor: 'var(--voxel-ink)', color: 'var(--voxel-solid-white)' }
                            : { background: 'var(--voxel-torch)', borderColor: 'var(--voxel-ink)', color: 'var(--voxel-ink)' }}
                    >
                        {request.confirmLabel || '确定'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialogHost;
