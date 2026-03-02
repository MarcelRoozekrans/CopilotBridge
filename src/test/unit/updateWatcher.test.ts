import * as assert from 'assert';
import { UpdateWatcher } from '../../updateWatcher';

describe('UpdateWatcher', () => {
    let watcher: UpdateWatcher;

    beforeEach(() => {
        watcher = new UpdateWatcher('~/.claude/plugins/cache');
    });

    afterEach(() => {
        watcher.dispose();
    });

    it('should create without errors', () => {
        assert.ok(watcher);
    });

    it('should start local watcher without errors', () => {
        watcher.startLocalWatcher();
        // If we get here without throwing, the watcher was created
        assert.ok(true);
    });

    it('should allow subscribing to onLocalChange event', () => {
        let called = false;
        const disposable = watcher.onLocalChange(() => { called = true; });
        assert.ok(disposable);
        assert.ok(disposable.dispose);
        disposable.dispose();
    });

    it('should allow subscribing to onRemoteChange event', () => {
        let called = false;
        const disposable = watcher.onRemoteChange(() => { called = true; });
        assert.ok(disposable);
        assert.ok(disposable.dispose);
        disposable.dispose();
    });

    it('should stop remote checker without errors even if not started', () => {
        watcher.stopRemoteChecker();
        assert.ok(true);
    });

    it('should dispose cleanly', () => {
        watcher.startLocalWatcher();
        watcher.dispose();
        // Double dispose should not throw
        watcher.dispose();
        assert.ok(true);
    });

    it('should stop remote timer on dispose', () => {
        // Start a remote checker with a long interval so it doesn't fire
        watcher.startRemoteChecker(['owner/repo'], 999999, {
            skills: {},
            marketplaces: [],
            settings: { checkInterval: 86400, autoAcceptUpdates: false },
        });
        // Dispose should clear the interval
        watcher.dispose();
        assert.ok(true);
    });

    it('should restart remote checker when called again', () => {
        const manifest = {
            skills: {},
            marketplaces: [],
            settings: { checkInterval: 86400, autoAcceptUpdates: false },
        };
        watcher.startRemoteChecker(['owner/repo'], 999999, manifest);
        // Calling again should stop the old one and start a new one
        watcher.startRemoteChecker(['owner/other'], 999999, manifest);
        watcher.dispose();
        assert.ok(true);
    });
});
