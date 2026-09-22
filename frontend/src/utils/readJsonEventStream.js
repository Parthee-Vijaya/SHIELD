// Read authenticated fetch-based SSE. The caller supplies authFetch so access
// tokens stay in headers and never appear in a URL or EventSource query string.
export async function readJsonEventStream(response, { signal, onEvent, invalidMessage = 'Tjenesten returnerede et ugyldigt svar. Prøv igen.' }) {
  if (!response.ok || !response.body?.getReader) {
    const detail = await response.json().catch(() => null);
    const message = response.status === 401 ? 'Din session er udløbet. Log ind igen.'
      : response.status === 403 ? 'Din bruger har ikke adgang til denne funktion.'
        : typeof detail?.detail === 'string' ? detail.detail : `Tjenesten kunne ikke fuldføre forespørgslen (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (response.headers?.get('content-type') && !response.headers.get('content-type').includes('text/event-stream')) throw new Error(invalidMessage);
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const abortError = () => new DOMException('Strømmen blev afbrudt.', 'AbortError');
  const abort = () => { Promise.resolve(reader.cancel?.()).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) throw abortError();
      const { value, done } = await reader.read();
      if (signal?.aborted) throw abortError();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      buffer = buffer.replace(/\r\n/g, '\n');
      let separator;
      while ((separator = buffer.indexOf('\n\n')) !== -1) {
        const message = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const lines = message.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, ''));
        if (!lines.length) continue;
        let event;
        try { event = JSON.parse(lines.join('\n')); } catch { throw new Error(invalidMessage); }
        if (onEvent(event) === false) return;
      }
      if (done) {
        if (buffer.trim()) throw new Error(invalidMessage);
        return;
      }
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    try { await reader.cancel?.(); } catch { /* The aborted fetch may already own cleanup. */ }
    reader.releaseLock?.();
  }
}
