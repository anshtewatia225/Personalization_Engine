// Minimal structured JSON logger. Dependency-free so the service stays small;
// swap for pino/winston if the log volume grows.

export function createLogger(base = {}) {
  const write = (level, msg, fields) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...base, ...fields })
    if (level === 'error') process.stderr.write(`${line}\n`)
    else process.stdout.write(`${line}\n`)
  }
  return {
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
    child: (fields) => createLogger({ ...base, ...fields }),
  }
}
