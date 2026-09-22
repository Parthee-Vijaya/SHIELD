import { TextDecoder, TextEncoder } from 'util';
import { readJsonEventStream } from './readJsonEventStream';
const encoder = new TextEncoder();
global.TextDecoder = TextDecoder;
function responseWith(chunks) {
  const reader = { read: jest.fn(), cancel: jest.fn(), releaseLock: jest.fn() };
  chunks.forEach(chunk => reader.read.mockResolvedValueOnce({ value: typeof chunk === 'string' ? encoder.encode(chunk) : chunk, done: false }));
  reader.read.mockResolvedValue({ done: true });
  return { response: { ok: true, headers: { get: () => 'text/event-stream' }, body: { getReader: () => reader } }, reader };
}
test('parses fragmented UTF-8, CRLF, comments and multiple progress events', async () => {
  const bytes = encoder.encode(': heartbeat\r\ndata:{"progress":25,"text":"følsom"}\r\n\r\ndata: {"done":true}\r\n\r\n');
  const chunks = Array.from(bytes, value => new Uint8Array([value]));
  const { response, reader } = responseWith(chunks);
  const events = [];
  await readJsonEventStream(response, { onEvent: event => events.push(event) });
  expect(events).toEqual([{ progress: 25, text: 'følsom' }, { done: true }]);
  expect(reader.releaseLock).toHaveBeenCalled();
});
test('malformed data fails and releases the connection', async () => {
  const { response, reader } = responseWith(['data: not-json\n\n']);
  await expect(readJsonEventStream(response, { onEvent: jest.fn(), invalidMessage: 'Ugyldigt svar' })).rejects.toThrow('Ugyldigt svar');
  expect(reader.cancel).toHaveBeenCalled();
});
test.each([[401, 'session er udløbet'], [403, 'ikke adgang']])('authentication error %s is displayed before any stream is read', async (status, message) => {
  const response = { ok: false, status, json: async () => ({ detail: 'Private server detail' }) };
  await expect(readJsonEventStream(response, { onEvent: jest.fn() })).rejects.toThrow(message);
});
test('a completed event closes the stream without waiting for a hanging server', async () => {
  const { response, reader } = responseWith(['data: {"done":true}\n\n']);
  await readJsonEventStream(response, { onEvent: () => false });
  expect(reader.read).toHaveBeenCalledTimes(1);
  expect(reader.cancel).toHaveBeenCalled();
});
test('abort cancels a pending read and never presents late events', async () => {
  const controller = new AbortController();
  let finishRead;
  const reader = { read: () => new Promise(resolve => { finishRead = resolve; }), cancel: jest.fn(() => finishRead?.({ done: true })), releaseLock: jest.fn() };
  const onEvent = jest.fn();
  const pending = readJsonEventStream({ ok: true, body: { getReader: () => reader } }, { signal: controller.signal, onEvent });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(onEvent).not.toHaveBeenCalled();
  expect(reader.releaseLock).toHaveBeenCalled();
});
