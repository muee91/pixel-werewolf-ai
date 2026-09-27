let wsSendFn: ((message: any) => boolean) | null = null;

export function setWsSend(sendFn: ((message: any) => boolean) | null) {
    wsSendFn = sendFn;
}

export function sendWsMessage(message: any): boolean {
    if (wsSendFn) return wsSendFn(message);
    return false;
}
