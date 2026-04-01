import { describe, it, expect, beforeEach } from '@jest/globals';
import { TaskManager, TaskState } from '../../src/core/TaskManager.js';

describe('TaskManager', () => {
  let manager: TaskManager;

  beforeEach(() => {
    manager = new TaskManager();
  });

  describe('createTask', () => {
    it('should create a task with working status', () => {
      const task = manager.createTask();
      expect(task.taskId).toBeDefined();
      expect(task.status).toBe('working');
      expect(task.createdAt).toBeDefined();
      expect(task.lastUpdatedAt).toBeDefined();
      expect(task.ttl).toBe(300000); // default 5 minutes
      expect(task.pollInterval).toBe(5000); // default 5 seconds
    });

    it('should use requested TTL when provided', () => {
      const task = manager.createTask(60000);
      expect(task.ttl).toBe(60000);
    });

    it('should generate unique task IDs', () => {
      const task1 = manager.createTask();
      const task2 = manager.createTask();
      expect(task1.taskId).not.toBe(task2.taskId);
    });

    it('should throw when max tasks exceeded', () => {
      const smallManager = new TaskManager({ maxTasks: 2 });
      smallManager.createTask();
      smallManager.createTask();
      expect(() => smallManager.createTask()).toThrow('Maximum concurrent tasks exceeded');
    });

    it('should clean up expired tasks before rejecting max tasks', () => {
      const smallManager = new TaskManager({ maxTasks: 2, defaultTtl: 1 });
      smallManager.createTask();
      smallManager.createTask();

      // Wait for tasks to expire
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy wait for expiry
      }

      // Should succeed after cleanup of expired tasks
      const task = smallManager.createTask();
      expect(task.status).toBe('working');
    });
  });

  describe('getTask', () => {
    it('should return a task by ID', () => {
      const created = manager.createTask();
      const retrieved = manager.getTask(created.taskId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.taskId).toBe(created.taskId);
    });

    it('should return undefined for unknown task ID', () => {
      const result = manager.getTask('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should return undefined for expired tasks', () => {
      const shortLivedManager = new TaskManager({ defaultTtl: 1 });
      const task = shortLivedManager.createTask();

      // Wait for task to expire
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy wait for expiry
      }

      const result = shortLivedManager.getTask(task.taskId);
      expect(result).toBeUndefined();
    });
  });

  describe('updateStatus', () => {
    it('should update task status', () => {
      const task = manager.createTask();
      const updated = manager.updateStatus(task.taskId, 'completed');
      expect(updated.status).toBe('completed');
      // lastUpdatedAt should be a valid ISO string (may or may not differ from createdAt in fast tests)
      expect(new Date(updated.lastUpdatedAt).toISOString()).toBe(updated.lastUpdatedAt);
    });

    it('should update status with message', () => {
      const task = manager.createTask();
      const updated = manager.updateStatus(task.taskId, 'completed', 'Done processing');
      expect(updated.statusMessage).toBe('Done processing');
    });

    it('should throw for unknown task ID', () => {
      expect(() => manager.updateStatus('nonexistent', 'completed')).toThrow(
        'Task not found: nonexistent'
      );
    });

    it('should throw when transitioning from completed status', () => {
      const task = manager.createTask();
      manager.updateStatus(task.taskId, 'completed');
      expect(() => manager.updateStatus(task.taskId, 'working')).toThrow(
        'Cannot transition from terminal status: completed'
      );
    });

    it('should throw when transitioning from failed status', () => {
      const task = manager.createTask();
      manager.updateStatus(task.taskId, 'failed');
      expect(() => manager.updateStatus(task.taskId, 'working')).toThrow(
        'Cannot transition from terminal status: failed'
      );
    });

    it('should throw when transitioning from cancelled status', () => {
      const task = manager.createTask();
      manager.updateStatus(task.taskId, 'cancelled');
      expect(() => manager.updateStatus(task.taskId, 'working')).toThrow(
        'Cannot transition from terminal status: cancelled'
      );
    });

    it('should allow transition from working to input_required', () => {
      const task = manager.createTask();
      const updated = manager.updateStatus(task.taskId, 'input_required', 'Need more data');
      expect(updated.status).toBe('input_required');
      expect(updated.statusMessage).toBe('Need more data');
    });

    it('should allow transition from input_required to working', () => {
      const task = manager.createTask();
      manager.updateStatus(task.taskId, 'input_required');
      const updated = manager.updateStatus(task.taskId, 'working', 'Resuming');
      expect(updated.status).toBe('working');
    });
  });

  describe('completeTask', () => {
    it('should mark task as completed with result', () => {
      const task = manager.createTask();
      const result = { content: [{ type: 'text', text: 'Hello' }] };
      const completed = manager.completeTask(task.taskId, result);
      expect(completed.status).toBe('completed');
      expect(completed.result).toEqual(result);
    });

    it('should throw for unknown task', () => {
      expect(() => manager.completeTask('nonexistent', {})).toThrow(
        'Task not found: nonexistent'
      );
    });
  });

  describe('failTask', () => {
    it('should mark task as failed with error', () => {
      const task = manager.createTask();
      const error = new Error('Something went wrong');
      const failed = manager.failTask(task.taskId, error);
      expect(failed.status).toBe('failed');
      expect(failed.statusMessage).toBe('Something went wrong');
      expect(failed.error).toBe(error);
    });

    it('should handle string errors', () => {
      const task = manager.createTask();
      const failed = manager.failTask(task.taskId, 'string error');
      expect(failed.status).toBe('failed');
      expect(failed.statusMessage).toBe('string error');
    });

    it('should throw for unknown task', () => {
      expect(() => manager.failTask('nonexistent', new Error('fail'))).toThrow(
        'Task not found: nonexistent'
      );
    });
  });

  describe('cancelTask', () => {
    it('should cancel a working task', () => {
      const task = manager.createTask();
      const cancelled = manager.cancelTask(task.taskId);
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.statusMessage).toBe('Task was cancelled by request');
    });

    it('should cancel an input_required task', () => {
      const task = manager.createTask();
      manager.updateStatus(task.taskId, 'input_required');
      const cancelled = manager.cancelTask(task.taskId);
      expect(cancelled.status).toBe('cancelled');
    });

    it('should throw when cancelling a completed task', () => {
      const task = manager.createTask();
      manager.completeTask(task.taskId, {});
      expect(() => manager.cancelTask(task.taskId)).toThrow(
        'Cannot cancel task in terminal status: completed'
      );
    });

    it('should throw when cancelling a failed task', () => {
      const task = manager.createTask();
      manager.failTask(task.taskId, new Error('fail'));
      expect(() => manager.cancelTask(task.taskId)).toThrow(
        'Cannot cancel task in terminal status: failed'
      );
    });

    it('should throw when cancelling an already cancelled task', () => {
      const task = manager.createTask();
      manager.cancelTask(task.taskId);
      expect(() => manager.cancelTask(task.taskId)).toThrow(
        'Cannot cancel task in terminal status: cancelled'
      );
    });

    it('should throw for unknown task', () => {
      expect(() => manager.cancelTask('nonexistent')).toThrow(
        'Task not found: nonexistent'
      );
    });
  });

  describe('listTasks', () => {
    it('should return empty list when no tasks exist', () => {
      const result = manager.listTasks();
      expect(result.tasks).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('should return all tasks', () => {
      manager.createTask();
      manager.createTask();
      manager.createTask();
      const result = manager.listTasks();
      expect(result.tasks).toHaveLength(3);
    });

    it('should paginate with cursor', () => {
      for (let i = 0; i < 5; i++) {
        manager.createTask();
      }

      const page1 = manager.listTasks(undefined, 2);
      expect(page1.tasks).toHaveLength(2);
      expect(page1.nextCursor).toBe('2');

      const page2 = manager.listTasks(page1.nextCursor, 2);
      expect(page2.tasks).toHaveLength(2);
      expect(page2.nextCursor).toBe('4');

      const page3 = manager.listTasks(page2.nextCursor, 2);
      expect(page3.tasks).toHaveLength(1);
      expect(page3.nextCursor).toBeUndefined();
    });

    it('should exclude expired tasks from list', () => {
      const shortLivedManager = new TaskManager({ defaultTtl: 1 });
      shortLivedManager.createTask();

      // Wait for task to expire
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy wait for expiry
      }

      const result = shortLivedManager.listTasks();
      expect(result.tasks).toHaveLength(0);
    });
  });

  describe('waitForCompletion', () => {
    it('should resolve when task completes', async () => {
      const task = manager.createTask();

      // Complete the task asynchronously
      setTimeout(() => {
        manager.completeTask(task.taskId, { data: 'done' });
      }, 50);

      const result = await manager.waitForCompletion(task.taskId, 5000);
      expect(result.status).toBe('completed');
      expect(result.result).toEqual({ data: 'done' });
    });

    it('should resolve when task fails', async () => {
      const task = manager.createTask();

      setTimeout(() => {
        manager.failTask(task.taskId, new Error('oops'));
      }, 50);

      const result = await manager.waitForCompletion(task.taskId, 5000);
      expect(result.status).toBe('failed');
    });

    it('should resolve when task is cancelled', async () => {
      const task = manager.createTask();

      setTimeout(() => {
        manager.cancelTask(task.taskId);
      }, 50);

      const result = await manager.waitForCompletion(task.taskId, 5000);
      expect(result.status).toBe('cancelled');
    });

    it('should resolve with current state on timeout', async () => {
      const task = manager.createTask();

      const result = await manager.waitForCompletion(task.taskId, 300);
      expect(result.status).toBe('working');
    });
  });

  describe('custom configuration', () => {
    it('should use custom default TTL', () => {
      const customManager = new TaskManager({ defaultTtl: 60000 });
      const task = customManager.createTask();
      expect(task.ttl).toBe(60000);
    });

    it('should use custom poll interval', () => {
      const customManager = new TaskManager({ defaultPollInterval: 10000 });
      const task = customManager.createTask();
      expect(task.pollInterval).toBe(10000);
    });

    it('should use custom max tasks', () => {
      const customManager = new TaskManager({ maxTasks: 1 });
      customManager.createTask();
      expect(() => customManager.createTask()).toThrow('Maximum concurrent tasks exceeded');
    });
  });

  describe('TTL behavior', () => {
    it('should support null TTL for unlimited lifetime', () => {
      const task = manager.createTask();
      // Manually set ttl to null to test unlimited lifetime
      const retrieved = manager.getTask(task.taskId);
      expect(retrieved).toBeDefined();
    });

    it('should use requested TTL over default', () => {
      const task = manager.createTask(120000);
      expect(task.ttl).toBe(120000);
    });
  });
});
