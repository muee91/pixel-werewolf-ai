import { getDefaultStore } from 'jotai';
import { addToastAtom, confirmRequestAtom, type ToastType } from '../atoms';

// 命令式通知/确认原语：在事件处理器与非组件代码里替代 window.alert / window.confirm。
// 依赖 jotai 默认 store（全应用未包 Provider，getDefaultStore 与 useAtom 同源）。

const DEFAULT_DURATION: Record<ToastType, number> = {
    success: 3000,
    info: 3500,
    warning: 5000,
    // 错误往往带"下一步怎么办"，多留几秒
    error: 6000,
};

export const showToast = (message: string, type: ToastType = 'info', duration?: number) => {
    getDefaultStore().set(addToastAtom, message, type, duration ?? DEFAULT_DURATION[type]);
};

export interface ConfirmOptions {
    title?: string;
    confirmLabel?: string;
    /** 破坏性操作时确认键走红石深底 */
    danger?: boolean;
}

export const confirmDialog = (message: string, opts: ConfirmOptions = {}): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
        getDefaultStore().set(confirmRequestAtom, {
            title: opts.title,
            message,
            confirmLabel: opts.confirmLabel,
            danger: opts.danger,
            resolve,
        });
    });
