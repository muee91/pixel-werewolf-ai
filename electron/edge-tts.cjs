// Edge TTS 协议的 Node 实现(纯 JS,零 Python 依赖)。
// 协议要点:WS 连微软云 + Sec-MS-GEC DRM 令牌(Windows FILETIME 5 分钟取整做 SHA256),
// 二进制帧 2 字节头长 + 头(JSON,含 Path) + 载荷;Path:audio 为音频,path:turn.end 为结束。
const crypto = require('crypto');
const WebSocket = require('ws');

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const VOICES_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list';
const CHROMIUM_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.3650.75';

const WIN_EPOCH = 11644473600;

// DRM 令牌计算:秒数加 Windows epoch 后按 300 秒取整,再换算为 100ns tick;
// 使用 Number 运算保持服务端要求的舍入行为。
function secMsGec(skewSeconds = 0) {
    let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH + skewSeconds;
    ticks -= ticks % 300;
    ticks = ticks * (1e9 / 100);
    const str = `${ticks.toFixed(0)}${TRUSTED_TOKEN}`;
    return crypto.createHash('sha256').update(str, 'ascii').digest('hex').toUpperCase();
}

// Edge TTS 所需的 UTC 时间字符串格式,例如 "Fri Sep 12 2026 12:00:00 GMT+0000 (Coordinated Universal Time)"。
function dateToString() {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const p = (n) => String(n).padStart(2, '0');
    const d = new Date();
    return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${p(d.getUTCDate())} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
}

function xmlEscape(text) {
    return String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildSsml(text, voice, rate, pitch) {
    return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
        `<voice name='${voice}'><prosody rate='${rate}' pitch='${pitch}'>${xmlEscape(text)}</prosody></voice></speak>`;
}

function connectWs(url) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url, {
            headers: {
                Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
                'User-Agent': CHROMIUM_UA,
                ...arguments[1],
            },
        });
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
    });
}

// 合成:返回 MP3 Buffer。403/时钟偏差时带 ±5/10 分钟偏移重试。
function synthesize(text, voice, rate = '+0%', pitch = '+0Hz', timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        let attempt = 0;
        const skews = [0, 300, -300, 600, -600];
        const tryOnce = () => {
            const skew = skews[Math.min(attempt, skews.length - 1)];
            const gec = secMsGec(skew);
            const connectionId = crypto.randomBytes(16).toString('hex');
            const url = `${WSS_URL}?TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-143.0.3650.75&ConnectionId=${connectionId}`;

            // 微软端要求浏览器 User-Agent:无 UA 直接 403(实测)
            connectWs(url, { 'User-Agent': CHROMIUM_UA }).then((ws) => {
                const chunks = [];
                const ts = dateToString();
                const requestId = crypto.randomBytes(16).toString('hex');
                const timer = setTimeout(() => {
                    try { ws.close(); } catch { /* ignore */ }
                    reject(new Error('Edge TTS 合成超时'));
                }, timeoutMs);

                ws.on('message', (data, isBinary) => {
                    if (isBinary) {
                        const headerLen = data.readUInt16BE(0);
                        const header = data.slice(2, 2 + headerLen).toString('utf8');
                        if (header.includes('Path:audio')) {
                            chunks.push(data.slice(2 + headerLen));
                        }
                        return;
                    }
                    const textMsg = data.toString('utf8');
                    if (textMsg.includes('Path:turn.end')) {
                        clearTimeout(timer);
                        try { ws.close(); } catch { /* ignore */ }
                        resolve(Buffer.concat(chunks));
                    }
                });
                ws.on('close', () => {
                    clearTimeout(timer);
                });
                ws.on('error', (err) => {
                    clearTimeout(timer);
                    reject(err);
                });

                ws.send(
                    `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
                    JSON.stringify({
                        context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } },
                    }),
                );
                ws.send(
                    `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n` +
                    buildSsml(text, voice, rate, pitch),
                );
            }).catch((err) => {
                attempt += 1;
                if (attempt > 4) return reject(err);
                setTimeout(tryOnce, 300);
            });
        };
        tryOnce();
    });
}

// 音色列表:返回 Edge TTS voices 接口格式
async function listVoices() {
    const url = `${VOICES_URL}?trustedclienttoken=${TRUSTED_TOKEN}`;
    const attempts = [0, 300, -300];
    for (const skew of attempts) {
        const res = await fetch(url, {
            headers: {
                'User-Agent': CHROMIUM_UA,
                'Sec-MS-GEC': secMsGec(skew),
                'Sec-MS-GEC-Version': '1-143.0.3650.75',
                Accept: 'application/json',
            },
        });
        if (res.ok) return await res.json();
        if (res.status === 401 || res.status === 403) continue;
        throw new Error(`voices list HTTP ${res.status}`);
    }
    throw new Error('voices list unavailable');
}

module.exports = { synthesize, listVoices };
