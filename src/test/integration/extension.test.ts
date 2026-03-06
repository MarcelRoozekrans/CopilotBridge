import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Extension Lifecycle', () => {
    it('should be present in installed extensions', () => {
        const ext = vscode.extensions.getExtension('MarcelRoozekrans.copilot-skill-bridge');
        assert.ok(ext, 'Extension not found');
    });

    it('should activate successfully', async () => {
        const ext = vscode.extensions.getExtension('MarcelRoozekrans.copilot-skill-bridge');
        assert.ok(ext);
        await ext.activate();
        assert.strictEqual(ext.isActive, true);
    });

    it('should register all expected commands', async () => {
        const commands = await vscode.commands.getCommands(true);
        const expected = [
            'copilotSkillBridge.importSkill',
            'copilotSkillBridge.updateSkill',
            'copilotSkillBridge.importAllSkills',
            'copilotSkillBridge.checkForUpdates',
            'copilotSkillBridge.addMarketplace',
            'copilotSkillBridge.removeSkill',
            'copilotSkillBridge.rebuildRegistry',
            'copilotSkillBridge.login',
        ];
        for (const cmd of expected) {
            assert.ok(commands.includes(cmd), `Command ${cmd} not registered`);
        }
    });
});
