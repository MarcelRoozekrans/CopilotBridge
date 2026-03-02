import * as assert from 'assert';
import { buildAuthHeaders } from '../auth';

describe('buildAuthHeaders', () => {
    it('should return base headers when no token provided', () => {
        const headers = buildAuthHeaders(undefined);
        assert.strictEqual(headers['User-Agent'], 'copilot-skill-bridge');
        assert.strictEqual(headers['Accept'], 'application/vnd.github.v3+json');
        assert.strictEqual(headers['Authorization'], undefined);
    });

    it('should include Authorization header when token provided', () => {
        const headers = buildAuthHeaders('ghp_test123');
        assert.strictEqual(headers['Authorization'], 'Bearer ghp_test123');
        assert.strictEqual(headers['User-Agent'], 'copilot-skill-bridge');
    });
});
