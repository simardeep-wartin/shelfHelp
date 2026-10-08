// Logger. Writes one JSON line per event to stderr.
// stderr, not stdout: stdout is reserved for the JSON responses (responses.json).
export function log(event: string, details: Record<string, unknown> = {}) {
  const line = { time: new Date().toISOString(), event: event, ...details };
  process.stderr.write(JSON.stringify(line) + "\n");
}
