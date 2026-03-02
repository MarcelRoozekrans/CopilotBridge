import * as assert from 'assert';
import * as vscode from 'vscode';
import { buildAuthHeaders, getGitHubToken, loginToGitHub } from '../../auth';

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

describe('getGitHubToken', () => {
    const origGetSession = vscode.authentication.getSession;

    afterEach(() => {
        (vscode.authentication as any).getSession = origGetSession;
    });

    it('should return undefined when no session exists', async () => {
        const token = await getGitHubToken();
        assert.strictEqual(token, undefined);
    });

    it('should return token when session exists', async () => {
        (vscode.authentication as any).getSession = async () => ({ accessToken: 'ghp_abc123' });
        const token = await getGitHubToken();
        assert.strictEqual(token, 'ghp_abc123');
    });

    it('should return undefined when auth throws', async () => {
        (vscode.authentication as any).getSession = async () => { throw new Error('auth error'); };
        const token = await getGitHubToken();
        assert.strictEqual(token, undefined);
    });
});

describe('loginToGitHub', () => {
    const origGetSession = vscode.authentication.getSession;

    afterEach(() => {
        (vscode.authentication as any).getSession = origGetSession;
    });

    it('should return undefined when no session created', async () => {
        (vscode.authentication as any).getSession = async () => undefined;
        const token = await loginToGitHub();
        assert.strictEqual(token, undefined);
    });

    it('should return token when login succeeds', async () => {
        (vscode.authentication as any).getSession = async () => ({ accessToken: 'ghp_login_token' });
        const token = await loginToGitHub();
        assert.strictEqual(token, 'ghp_login_token');
    });

    it('should return undefined when login throws', async () => {
        (vscode.authentication as any).getSession = async () => { throw new Error('cancelled'); };
        const token = await loginToGitHub();
        assert.strictEqual(token, undefined);
    });
});
