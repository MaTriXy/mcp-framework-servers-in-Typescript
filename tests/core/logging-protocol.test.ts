import { describe, it, expect } from '@jest/globals';

// Import the log level severity map from MCPServer
// Since it's exported, we can test it
import { LOG_LEVEL_SEVERITY, MCPLogLevel } from '../../src/core/MCPServer.js';

describe('Logging Protocol', () => {
  describe('Log Level Severity', () => {
    it('should define all 8 RFC 5424 levels', () => {
      const levels: MCPLogLevel[] = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'];
      for (const level of levels) {
        expect(LOG_LEVEL_SEVERITY[level]).toBeDefined();
      }
    });

    it('should order levels by increasing severity', () => {
      expect(LOG_LEVEL_SEVERITY.debug).toBeLessThan(LOG_LEVEL_SEVERITY.info);
      expect(LOG_LEVEL_SEVERITY.info).toBeLessThan(LOG_LEVEL_SEVERITY.notice);
      expect(LOG_LEVEL_SEVERITY.notice).toBeLessThan(LOG_LEVEL_SEVERITY.warning);
      expect(LOG_LEVEL_SEVERITY.warning).toBeLessThan(LOG_LEVEL_SEVERITY.error);
      expect(LOG_LEVEL_SEVERITY.error).toBeLessThan(LOG_LEVEL_SEVERITY.critical);
      expect(LOG_LEVEL_SEVERITY.critical).toBeLessThan(LOG_LEVEL_SEVERITY.alert);
      expect(LOG_LEVEL_SEVERITY.alert).toBeLessThan(LOG_LEVEL_SEVERITY.emergency);
    });

    it('should have debug as lowest severity (0)', () => {
      expect(LOG_LEVEL_SEVERITY.debug).toBe(0);
    });

    it('should have emergency as highest severity (7)', () => {
      expect(LOG_LEVEL_SEVERITY.emergency).toBe(7);
    });
  });
});
