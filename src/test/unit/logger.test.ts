import * as assert from 'assert';
import { Logger } from '../../logger';

describe('Logger', () => {
    it('should format debug messages with timestamp and level', () => {
        const lines: string[] = [];
        const fakeChannel = { appendLine: (s: string) => lines.push(s) } as any;
        const logger = new Logger(fakeChannel);
        logger.debug('fileWriter', 'test message');
        assert.strictEqual(lines.length, 1);
        assert.ok(lines[0].includes('[DEBUG]'));
        assert.ok(lines[0].includes('fileWriter'));
        assert.ok(lines[0].includes('test message'));
    });

    it('should format warn messages', () => {
        const lines: string[] = [];
        const fakeChannel = { appendLine: (s: string) => lines.push(s) } as any;
        const logger = new Logger(fakeChannel);
        logger.warn('remoteReader', 'network error');
        assert.ok(lines[0].includes('[WARN]'));
        assert.ok(lines[0].includes('remoteReader'));
    });

    it('should format error messages', () => {
        const lines: string[] = [];
        const fakeChannel = { appendLine: (s: string) => lines.push(s) } as any;
        const logger = new Logger(fakeChannel);
        logger.error('importService', new Error('disk full'));
        assert.ok(lines[0].includes('[ERROR]'));
        assert.ok(lines[0].includes('disk full'));
    });

    it('should handle non-Error objects in err parameter', () => {
        const lines: string[] = [];
        const fakeChannel = { appendLine: (s: string) => lines.push(s) } as any;
        const logger = new Logger(fakeChannel);
        logger.debug('test', 42);
        assert.ok(lines[0].includes('42'));
    });

    it('should work without err parameter', () => {
        const lines: string[] = [];
        const fakeChannel = { appendLine: (s: string) => lines.push(s) } as any;
        const logger = new Logger(fakeChannel);
        logger.debug('test');
        assert.strictEqual(lines.length, 1);
        assert.ok(lines[0].includes('test'));
    });
});

describe('initLogger / getLogger', () => {
    it('should return the initialized logger', () => {
        const { initLogger, getLogger } = require('../../logger');
        const fakeChannel = { appendLine: () => {} } as any;
        const logger = initLogger(fakeChannel);
        assert.strictEqual(getLogger(), logger);
    });
});
