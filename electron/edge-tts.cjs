// Edge TTS 协议的 Node 实现(纯 JS,零 Python 依赖)。
// 协议要点:WS 连微软云 + Sec-MS-GEC DRM 令牌(Windows FILETIME 5 分钟取整做 SHA256),
// 二进制帧 2 字节头长 + 头(JSON,含 Path) + 载荷;Path:audio 为音频,path:turn.end 为结束。
const crypto = require('crypto');
const WebSocket = require('ws');

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
// 2026-10 实测：旧端点 speech.platform.bing.com/.../edge/v1 的 WebSocket 握手一律 403
//（同一台机器、同一 Sec-MS-GEC、同一 UA，voices/list 的 HTTPS 仍是 200），
// 微软已把朗读合成迁到 api.msedgeservices.com，并且换了鉴权方式：
//   · 参数名 TrustedClientToken → Ocp-Apim-Subscription-Key
//   · 令牌从 SHA256 升级到 CS64-SHA256（返回 "<cs64>-<sha256>"），版本号前缀 2-
//   · 握手仍需 Host: speech.platform.bing.com 与 no-cache 头，缺一项 403
// 音色列表接口没变，仍走旧域名的 V1 令牌（见 listVoices）。
const SEC_MS_GEC_VERSION_V2 = '2-143.0.3650.75';

// CS64 哈希：微软在 V2 令牌里用的自定义 64 位摘要，算法来自 node-edge-tts 1.2.12。
const CS64_PREFIX = Buffer.from(
    'Q29weXJpZ2h0IChDKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQu',
    'base64',
);
const CS64_COEFFICIENTS = [
    [0xE82E91B1, 0xB32700D0], [0x44DE24C6, 0x88DFF51D], [0x3BEB65BC, 0x29514038],
    [0xC89C5933, 0xB328CBDF], [0x8D1EC211, 0xD405B4D5], [0x314EF5D5, 0x26E55F3C],
    [0xE92491B1, 0x607801C6], [0xF0A5B9D5, 0x82B2C1FB], [0x06064CF3, 0xFA51A3DA],
    [0xDA79FA60, 0x207CC464], [0xBED20560, 0x3C3C74F3], [0x89F9C9F8, 0xD2D14B61],
    [0x35FA38C6, 0xBB04A2C1], [0xCB49E3C6, 0xC5626167],
];
const imul = Math.imul;
const rol16 = (x) => ((x << 16) | (x >>> 16)) >>> 0;

function cs64Digest(data, shaDigest) {
    const keyA = (shaDigest.readUInt32LE(0) | 1) >>> 0;
    const keyB = (shaDigest.readUInt32LE(4) | 1) >>> 0;
    const factors = [imul(keyA, 0x82893933) >>> 0, imul(keyB, 0x82893933) >>> 0];
    const terms = CS64_COEFFICIENTS.map(([coefficient], i) => imul(coefficient, factors[i % 2]) >>> 0);
    const offsets = CS64_COEFFICIENTS.map(([, offset]) => offset);
    const padded = Buffer.alloc(Math.ceil((data.length + 1) / 8) * 8);
    padded.set(data, 1);
    for (let i = 0; i < padded.length / 4; i++) {
        const word = padded.readUInt32LE(i * 4);
        let term = imul(word, i % 2 === 0 ? keyA : keyB);
        let offset = imul(rol16(word), i % 2 === 0 ? 0xEF0569FB : 0xC31713DB);
        if (i === 0) {
            term = (term + imul(0xF2F90B1A, factors[0])) >>> 0;
            offset = (offset + 0x0B1A0000) >>> 0;
        }
        terms.push(term >>> 0);
        offsets.push(offset >>> 0);
    }
    let swapAcc = 0;
    let swapLast = 0;
    let state = 0;
    let acc = 0;
    for (let i = 0; i < terms.length; i += 2) {
        const x = terms[i];
        const y = terms[i + 1];
        let t = rol16((offsets[i] + x) >>> 0);
        let q = imul(t, 0x76F50F34);
        swapAcc += (imul(rol16(q), 0xC3EFEA97) + q) >>> 0;
        t = rol16((offsets[i + 1] + y) >>> 0);
        q = imul(t, 0x1881CE3C);
        swapLast = (imul(rol16(q), 0x35BD1EC9) + q) >>> 0;
        swapAcc = (swapAcc + swapLast) >>> 0;
        state = (imul(state, keyA) + x) >>> 0;
        for (const k of [0xCF98B111, 0x87085B9F, 0x12CEB96D, 0x257E1D83]) {
            state = imul(rol16(state), k) >>> 0;
        }
        acc += state;
        t = (imul(state, keyB) + y) >>> 0;
        t = imul(rol16(t), 0xA27416F5) >>> 0;
        t = imul(rol16(t), 0xD38396FF) >>> 0;
        state = imul(rol16(imul(rol16(t), 0x7C932B89)), 0xBFA49F69) >>> 0;
        acc = (acc + state) >>> 0;
    }
    const result = Buffer.allocUnsafe(8);
    result.writeUInt32LE((swapLast ^ state) >>> 0, 0);
    result.writeUInt32LE((swapAcc ^ acc) >>> 0, 4);
    return result;
}

function secMsGecV2(skewSeconds = 0) {
    const epochSeconds = BigInt(Math.floor(Date.now() / 1000) + skewSeconds) + BigInt(WIN_EPOCH);
    const rounded = epochSeconds - (epochSeconds % 300n);
    const ticks = rounded * 10000000n;
    const data = Buffer.from(`${ticks}${TRUSTED_TOKEN}`, 'ascii');
    const sha = crypto.createHash('sha256').update(CS64_PREFIX).update(data).digest();
    return `${cs64Digest(data, sha).toString('hex').toUpperCase()}-${sha.toString('hex').toUpperCase()}`;
}

const WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const VOICES_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list';
const CHROMIUM_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.3650.75';
// 合成握手单独用 Windows UA：新端点对 Mac UA 返回 HTTP 200 + 空响应（不是 101，也不是 403），
// 换 Windows 后正常 101。音色列表接口仍接受 CHROMIUM_UA。
const SYNTH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';

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

function connectWs(url, extraHeaders = {}, wsOptions = {}) {
    return new Promise((resolve, reject) => {
        // Origin 用 ws 自己的选项传（它会写进握手），同时再塞一份到 headers 会重复；
        // 只有调用方没指定 origin 时才补默认值。
        const headers = { 'User-Agent': CHROMIUM_UA, ...extraHeaders };
        if (!wsOptions.origin) headers.Origin = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';
        const ws = new WebSocket(url, { ...wsOptions, headers });
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
    });
}

// 合成:返回 MP3 Buffer。令牌按 300 秒窗口取整，时钟偏差会让验签失败，所以带偏移重试。
function synthesize(text, voice, rate = '+0%', pitch = '+0Hz', timeoutMs = 30000) {
    const SKEWS = [0, 300, -300, 600];
    const endpoint = 'wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1';
    return new Promise((resolve, reject) => {
        let attempt = 0;
        const tryOnce = () => {
            const gec = secMsGecV2(SKEWS[Math.min(attempt, SKEWS.length - 1)]);
            const url = `${endpoint}?Ocp-Apim-Subscription-Key=${TRUSTED_TOKEN}` +
                `&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION_V2}`;

            // 连接走新域名，但 Host 必须还是 speech.platform.bing.com，否则 403（实测）。
            // 微软端还要求浏览器 User-Agent:无 UA 直接 403。
            connectWs(
                url,
                {
                    // 合成端点要求 Windows 版 Edge 的 UA（Mac UA 会被判成 200 + 空响应，实测）
                    'User-Agent': SYNTH_UA,
                    Pragma: 'no-cache',
                    'Cache-Control': 'no-cache',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                {
                    host: 'speech.platform.bing.com',
                    origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
                },
            ).then((ws) => {
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
