export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 2048;
export const MAX_CHAT_CODEPOINTS = 160;

export function parseMessage(raw) {
    const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
    if (Buffer.byteLength(text, 'utf8') > MAX_MESSAGE_BYTES) throw new Error('message_too_large');
    let message;
    try { message = JSON.parse(text); } catch { throw new Error('invalid_json'); }
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') throw new Error('invalid_message');
    return message;
}

export function message(type, payload = {}) {
    return JSON.stringify({ v: PROTOCOL_VERSION, type, ...payload });
}

