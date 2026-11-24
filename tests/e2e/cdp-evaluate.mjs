const knownDescriptions = [
  [/execution context was destroyed|cannot find context|no frame with given id/i, 'Page execution context changed during navigation.'],
  [/failed to fetch|networkerror/i, 'Browser request failed.'],
  [/failed to parse url|invalid url/i, 'Browser request URL could not be resolved.'],
  [/timeout|aborted/i, 'Browser operation timed out or was aborted.'],
  [/not defined/i, 'A required browser global is unavailable.'],
];

export function classifyCdpException(details = {}) {
  const raw = String(details.exception?.description ?? details.text ?? '');
  const category = /^(TypeError|ReferenceError|SyntaxError|DOMException|Error|RangeError)\b/.exec(raw)?.[1] ??
    (/^[A-Za-z]+Error$/.test(details.exception?.className ?? '') ? details.exception.className : 'BrowserException');
  const description = knownDescriptions.find(([pattern]) => pattern.test(raw))?.[1] ?? 'Browser evaluation failed.';
  const contextLost = /execution context was destroyed|cannot find context|no frame with given id/i.test(raw);
  return { category, description, contextLost };
}

export async function evaluateCdp(command, { label, expression, stage }) {
  const started = performance.now();
  try {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      const { category, description, contextLost } = classifyCdpException(result.exceptionDetails);
      const error = new Error(`${label}: ${category}: ${description} stage=${stage} contextLost=${contextLost} elapsedMs=${Math.round(performance.now() - started)}`);
      error.contextLost = contextLost;
      throw error;
    }
    // An undefined return value is valid. CDP reports actual exceptions separately.
    return result.result?.value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${label}:`)) throw error;
    throw new Error(`${label}: CDP command failed. stage=${stage} contextLost=unknown elapsedMs=${Math.round(performance.now() - started)}`);
  }
}
