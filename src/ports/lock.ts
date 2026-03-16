import type { JobId } from '../domain/types';

export interface LockPort {
  acquireJobLock(jobId: JobId): Promise<boolean>;
  releaseJobLock(jobId: JobId): Promise<void>;
}
