import type { ApprovalId, JobId, Weekday, WorkspacePath } from './types';

export type Command =
  | { kind: 'cwd'; workspace: WorkspacePath }
  | { kind: 'status' }
  | { kind: 'reset' }
  | { kind: 'diff' }
  | { kind: 'help' }
  | { kind: 'jobs' }
  | { kind: 'job_show'; jobId: JobId }
  | { kind: 'job_pause'; jobId: JobId }
  | { kind: 'job_resume'; jobId: JobId }
  | { kind: 'job_delete'; jobId: JobId }
  | { kind: 'job_run'; jobId: JobId }
  | { kind: 'job_add_once'; runAt: string; workspace: WorkspacePath; prompt: string }
  | { kind: 'job_add_daily'; hm: string; workspace: WorkspacePath; prompt: string }
  | { kind: 'job_add_weekly'; weekdays: Weekday[]; hm: string; workspace: WorkspacePath; prompt: string }
  | { kind: 'approve'; approvalId: ApprovalId }
  | { kind: 'deny'; approvalId: ApprovalId };

export type ParseError = {
  code: 'EMPTY' | 'UNKNOWN_COMMAND' | 'INVALID_ARGUMENT' | 'INVALID_DATETIME';
  message: string;
};

const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const HM_RE = /^\d{2}:\d{2}$/;
const VALID_WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function parseCommand(text: string): Command | ParseError {
  const trimmed = text.trim();
  if (!trimmed) {
    return { code: 'EMPTY', message: '命令不能为空。' };
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return { code: 'EMPTY', message: '命令不能为空。' };
  }

  const [head, ...rest] = tokens;

  switch (head) {
    case '/cwd':
      if (rest.length !== 1) {
        return invalidArgument('/cwd <workspace>');
      }
      return { kind: 'cwd', workspace: rest[0] };
    case '/status':
      return rest.length === 0 ? { kind: 'status' } : invalidArgument('/status');
    case '/reset':
      return rest.length === 0 ? { kind: 'reset' } : invalidArgument('/reset');
    case '/diff':
      return rest.length === 0 ? { kind: 'diff' } : invalidArgument('/diff');
    case '/help':
      return rest.length === 0 ? { kind: 'help' } : invalidArgument('/help');
    case '/jobs':
      return rest.length === 0 ? { kind: 'jobs' } : invalidArgument('/jobs');
    case '/approve':
      return rest.length === 1 ? { kind: 'approve', approvalId: rest[0] } : invalidArgument('/approve <approvalId>');
    case '/deny':
      return rest.length === 1 ? { kind: 'deny', approvalId: rest[0] } : invalidArgument('/deny <approvalId>');
    case '/job':
      return parseJob(rest);
    default:
      return { code: 'UNKNOWN_COMMAND', message: `未知命令：${head}` };
  }
}

function parseJob(tokens: string[]): Command | ParseError {
  const [action, ...rest] = tokens;
  switch (action) {
    case 'show':
      return rest.length === 1 ? { kind: 'job_show', jobId: rest[0] } : invalidArgument('/job show <jobId>');
    case 'pause':
      return rest.length === 1 ? { kind: 'job_pause', jobId: rest[0] } : invalidArgument('/job pause <jobId>');
    case 'resume':
      return rest.length === 1 ? { kind: 'job_resume', jobId: rest[0] } : invalidArgument('/job resume <jobId>');
    case 'delete':
      return rest.length === 1 ? { kind: 'job_delete', jobId: rest[0] } : invalidArgument('/job delete <jobId>');
    case 'run':
      return rest.length === 1 ? { kind: 'job_run', jobId: rest[0] } : invalidArgument('/job run <jobId>');
    case 'add':
      return parseJobAdd(rest);
    default:
      return { code: 'UNKNOWN_COMMAND', message: '未知 job 子命令。' };
  }
}

function parseJobAdd(tokens: string[]): Command | ParseError {
  const [kind, ...rest] = tokens;
  switch (kind) {
    case 'once':
      if (rest.length !== 3) {
        return invalidArgument('/job add once "<YYYY-MM-DD HH:MM>" "<workspace>" "<prompt>"');
      }
      if (!DATETIME_RE.test(rest[0])) {
        return invalidDatetime('一次性任务时间必须是 YYYY-MM-DD HH:MM。');
      }
      return { kind: 'job_add_once', runAt: rest[0], workspace: rest[1], prompt: rest[2] };
    case 'daily':
      if (rest.length !== 3) {
        return invalidArgument('/job add daily "<HH:MM>" "<workspace>" "<prompt>"');
      }
      if (!HM_RE.test(rest[0])) {
        return invalidDatetime('每日任务时间必须是 HH:MM。');
      }
      return { kind: 'job_add_daily', hm: rest[0], workspace: rest[1], prompt: rest[2] };
    case 'weekly':
      if (rest.length !== 4) {
        return invalidArgument('/job add weekly "<Mon,Wed,Fri>" "<HH:MM>" "<workspace>" "<prompt>"');
      }
      if (!HM_RE.test(rest[1])) {
        return invalidDatetime('每周任务时间必须是 HH:MM。');
      }
      const weekdays = parseWeekdays(rest[0]);
      if ('code' in weekdays) {
        return weekdays;
      }
      return { kind: 'job_add_weekly', weekdays, hm: rest[1], workspace: rest[2], prompt: rest[3] };
    default:
      return { code: 'UNKNOWN_COMMAND', message: '未知 add 子命令。' };
  }
}

function parseWeekdays(input: string): Weekday[] | ParseError {
  const values = input.split(',').map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) {
    return invalidArgument('weekly 任务至少需要一个 weekday。');
  }

  const unique = new Set<Weekday>();
  for (const value of values) {
    if (!VALID_WEEKDAYS.includes(value as Weekday)) {
      return invalidArgument(`非法 weekday：${value}`);
    }
    unique.add(value as Weekday);
  }
  return [...unique];
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  for (const match of input.matchAll(re)) {
    const quoted = match[1];
    const bare = match[2];
    tokens.push(quoted !== undefined ? quoted.replace(/\\"/g, '"') : bare);
  }
  return tokens;
}

function invalidArgument(message: string): ParseError {
  return { code: 'INVALID_ARGUMENT', message };
}

function invalidDatetime(message: string): ParseError {
  return { code: 'INVALID_DATETIME', message };
}
