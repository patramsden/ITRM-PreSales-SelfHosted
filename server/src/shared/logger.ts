import { randomBytes } from 'crypto';
import { query } from './db';

export type LogLevel    = 'info' | 'warn' | 'error';
export type LogCategory = 'auth' | 'proposal' | 'crm' | 'api' | 'system' | 'user';

export interface LogEntry {
  id:        string;
  createdAt: string;
  level:     LogLevel;
  category:  string;
  message:   string;
  details?:  string;
  userId?:   string;
  userName?: string;
}

interface LogOpts {
  details?:  Record<string, unknown>;
  userId?:   string;
  userName?: string;
}

const RETAIN_DAYS = 90;

export function log(level: LogLevel, category: string, message: string, opts?: LogOpts): void {
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleFn(`[${level.toUpperCase()}] [${category}] ${message}`, opts?.details ?? '');
  writeLog(level, category, message, opts).catch(() => {});
}

async function writeLog(level: LogLevel, category: string, message: string, opts?: LogOpts): Promise<void> {
  try {
    const id = randomBytes(18).toString('hex');
    await query(
      `INSERT INTO system_logs (id, level, category, message, details, user_id, user_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, level, category, message.slice(0, 2000),
       opts?.details ? JSON.stringify(opts.details) : null,
       opts?.userId ?? null, opts?.userName ?? null],
    );
    // Prune old entries
    query('DELETE FROM system_logs WHERE created_at < $1',
      [new Date(Date.now() - RETAIN_DAYS * 86400000)]).catch(() => {});
  } catch { /* swallow */ }
}
