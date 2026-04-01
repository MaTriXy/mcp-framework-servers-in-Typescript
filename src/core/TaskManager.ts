import { randomUUID } from 'node:crypto';
import { logger } from './Logger.js';

export type TaskStatus = 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled';

export interface TaskState {
  taskId: string;
  status: TaskStatus;
  statusMessage?: string;
  createdAt: string;
  lastUpdatedAt: string;
  ttl: number | null;
  pollInterval?: number;
  result?: any;
  error?: any;
}

export class TaskManager {
  private tasks = new Map<string, TaskState>();
  private defaultTtl: number;
  private defaultPollInterval: number;
  private maxTasks: number;

  constructor(options?: { defaultTtl?: number; defaultPollInterval?: number; maxTasks?: number }) {
    this.defaultTtl = options?.defaultTtl ?? 300000; // 5 minutes
    this.defaultPollInterval = options?.defaultPollInterval ?? 5000; // 5 seconds
    this.maxTasks = options?.maxTasks ?? 100;
  }

  createTask(requestedTtl?: number): TaskState {
    if (this.tasks.size >= this.maxTasks) {
      this.cleanup();
      if (this.tasks.size >= this.maxTasks) {
        throw new Error('Maximum concurrent tasks exceeded');
      }
    }

    const now = new Date().toISOString();
    const task: TaskState = {
      taskId: randomUUID(),
      status: 'working',
      createdAt: now,
      lastUpdatedAt: now,
      ttl: requestedTtl ?? this.defaultTtl,
      pollInterval: this.defaultPollInterval,
    };

    this.tasks.set(task.taskId, task);
    logger.debug(`Task created: ${task.taskId}`);
    return task;
  }

  getTask(taskId: string): TaskState | undefined {
    const task = this.tasks.get(taskId);
    if (task && this.isExpired(task)) {
      this.tasks.delete(taskId);
      return undefined;
    }
    return task;
  }

  updateStatus(taskId: string, status: TaskStatus, statusMessage?: string): TaskState {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const terminalStatuses: TaskStatus[] = ['completed', 'failed', 'cancelled'];
    if (terminalStatuses.includes(task.status)) {
      throw new Error(`Cannot transition from terminal status: ${task.status}`);
    }

    task.status = status;
    task.statusMessage = statusMessage;
    task.lastUpdatedAt = new Date().toISOString();
    return task;
  }

  completeTask(taskId: string, result: any): TaskState {
    const task = this.updateStatus(taskId, 'completed');
    task.result = result;
    return task;
  }

  failTask(taskId: string, error: any): TaskState {
    const task = this.updateStatus(taskId, 'failed', error?.message ?? String(error));
    task.error = error;
    return task;
  }

  cancelTask(taskId: string): TaskState {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const terminalStatuses: TaskStatus[] = ['completed', 'failed', 'cancelled'];
    if (terminalStatuses.includes(task.status)) {
      throw new Error(`Cannot cancel task in terminal status: ${task.status}`);
    }

    return this.updateStatus(taskId, 'cancelled', 'Task was cancelled by request');
  }

  listTasks(cursor?: string, limit: number = 50): { tasks: TaskState[]; nextCursor?: string } {
    this.cleanup();
    const allTasks = Array.from(this.tasks.values());
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const slice = allTasks.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < allTasks.length ? String(startIndex + limit) : undefined;
    return { tasks: slice, nextCursor };
  }

  waitForCompletion(taskId: string, timeoutMs: number = 30000): Promise<TaskState> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const task = this.getTask(taskId);
        if (!task) {
          clearInterval(checkInterval);
          reject(new Error(`Task not found: ${taskId}`));
          return;
        }
        const terminalStatuses: TaskStatus[] = ['completed', 'failed', 'cancelled'];
        if (terminalStatuses.includes(task.status)) {
          clearInterval(checkInterval);
          resolve(task);
          return;
        }
      }, 200);

      setTimeout(() => {
        clearInterval(checkInterval);
        const task = this.getTask(taskId);
        if (task) resolve(task);
        else reject(new Error(`Task not found: ${taskId}`));
      }, timeoutMs);
    });
  }

  private isExpired(task: TaskState): boolean {
    if (task.ttl === null) return false;
    const createdAt = new Date(task.createdAt).getTime();
    return Date.now() - createdAt > task.ttl;
  }

  private cleanup(): void {
    for (const [id, task] of this.tasks) {
      if (this.isExpired(task)) {
        this.tasks.delete(id);
      }
    }
  }
}
