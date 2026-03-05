# LM-Enhanced Skill Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an optional LM pass (via VS Code's Language Model API) after the existing regex conversion to contextually rephrase Claude-specific workflow descriptions for Copilot.

**Architecture:** Two-phase pipeline — deterministic regex first (unchanged), then LM contextual rewrite. Silent fallback to regex-only when Copilot LM is unavailable. New `lmConverter.ts` keeps LM logic isolated.

**Tech Stack:** VS Code Language Model API (`vscode.lm`), TypeScript

---

### Task 1: Add `useLmConversion` setting to package.json

**Files:**
- Modify: `package.json:295-300` (inside `configuration.properties`, before closing braces)

**Step 1: Add the setting**

In `package.json`, add a new property after `copilotSkillBridge.generateRegistry`:

```json
"copilotSkillBridge.useLmConversion": {
  "type": "boolean",
  "default": true,
  "description": "Use Copilot language model to enhance skill conversion (contextual rephrasing)"
}
```

**Step 2: Read setting in getConfig**

In `src/extension.ts`, update the `getConfig()` function (around line 171) to include:

```typescript
useLmConversion: config.get<boolean>('useLmConversion', true),
```

**Step 3: Commit**

```bash
git add package.json src/extension.ts
git commit -m "feat: add useLmConversion setting"
```

---

### Task 2: Create `src/lmConverter.ts` with tests (TDD)

**Files:**
- Create: `src/lmConverter.ts`
- Create: `src/test/unit/lmConverter.test.ts`

**Step 1: Write the failing tests**

Create `src/test/unit/lmConverter.test.ts`:

```typescript
import * as assert from 'assert';
import { buildLmPrompt, extractLmResponse, SYSTEM_PROMPT } from '../../lmConverter';

describe('buildLmPrompt', () => {
    it('should include the system prompt instructions', () => {
        assert.ok(SYSTEM_PROMPT.includes('GitHub Copilot'));
        assert.ok(SYSTEM_PROMPT.includes('Rewrite'));
    });

    it('should wrap content in a user message', () => {
        const messages = buildLmPrompt('Some skill content here');
        assert.strictEqual(messages.length, 2);
        assert.strictEqual(messages[0].role, 'system');
        assert.strictEqual(messages[1].role, 'user');
        assert.ok(messages[1].content.includes('Some skill content here'));
    });
});

describe('extractLmResponse', () => {
    it('should return the response text as-is', () => {
        const result = extractLmResponse('Rewritten content here');
        assert.strictEqual(result, 'Rewritten content here');
    });

    it('should trim whitespace from response', () => {
        const result = extractLmResponse('  content  \n');
        assert.strictEqual(result, 'content');
    });

    it('should strip markdown code fences if LM wraps output', () => {
        const result = extractLmResponse('```markdown\nthe content\n```');
        assert.strictEqual(result, 'the content');
    });

    it('should return empty string for empty response', () => {
        const result = extractLmResponse('');
        assert.strictEqual(result, '');
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run compile && npx mocha out/test/unit/lmConverter.test.js`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/lmConverter.ts`:

```typescript
import * as vscode from 'vscode';

export const SYSTEM_PROMPT = `You are rewriting AI assistant instructions. The original was written for Claude Code.
Rewrite it for GitHub Copilot in VS Code.

Rules:
1. Rephrase sentences that reference Claude-specific workflows, tools, or capabilities
2. Preserve all markdown formatting, code blocks, and structural elements exactly
3. Don't remove content - rephrase it
4. Don't change file paths or cross-references (already converted)
5. Return only the rewritten content, no explanation`;

interface LmMessage {
    role: 'system' | 'user';
    content: string;
}

export function buildLmPrompt(content: string): LmMessage[] {
    return [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
    ];
}

export function extractLmResponse(response: string): string {
    const trimmed = response.trim();
    if (!trimmed) { return ''; }

    // Strip markdown code fences if LM wraps the output
    const fenceMatch = trimmed.match(/^```(?:markdown)?\n([\s\S]*?)\n```$/);
    if (fenceMatch) {
        return fenceMatch[1].trim();
    }

    return trimmed;
}

export async function convertWithLM(content: string): Promise<string> {
    let models: vscode.LanguageModelChat[];
    try {
        models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        if (models.length === 0) {
            models = await vscode.lm.selectChatModels({});
        }
    } catch {
        return content; // silent fallback
    }

    if (models.length === 0) {
        return content; // no models available
    }

    const model = models[0];
    const messages = [
        vscode.LanguageModelChatMessage.User(
            `${SYSTEM_PROMPT}\n\n---\n\n${content}`
        ),
    ];

    try {
        const response = await model.sendRequest(messages, {});
        let result = '';
        for await (const chunk of response.text) {
            result += chunk;
        }
        const extracted = extractLmResponse(result);
        return extracted || content; // fall back if extraction is empty
    } catch {
        return content; // silent fallback on error
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run compile && npx mocha out/test/unit/lmConverter.test.js`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/lmConverter.ts src/test/unit/lmConverter.test.ts
git commit -m "feat: add lmConverter with LM integration and tests"
```

---

### Task 3: Integrate LM conversion into ImportService

**Files:**
- Modify: `src/importService.ts:92-103` (convertSkill method)
- Modify: `src/importService.ts:114` (importSkill call site)
- Modify: `src/importService.ts:149-152` (importAllSkills call site)
- Modify: `src/importService.ts:378-381` (embedSkill call site)

**Step 1: Make `convertSkill` async with LM support**

In `src/importService.ts`, add the import at the top:

```typescript
import { convertWithLM } from './lmConverter';
```

Change the `convertSkill` method (line 92) from sync to async:

```typescript
async convertSkill(skill: SkillInfo, outputFormats?: OutputFormat[], useLm?: boolean): Promise<ConversionResult> {
    const parsed = parseSkillFrontmatter(skill.content);
    let convertedBody = convertSkillContent(parsed.body, outputFormats);

    if (useLm) {
        convertedBody = await convertWithLM(convertedBody);
    }

    return {
        convertedBody,
        instructionsContent: generateInstructionsFile(skill.name, skill.description, convertedBody),
        promptContent: generatePromptFile(skill.name, skill.description),
        registryEntry: generateRegistryEntry(skill.name, outputFormats),
        originalContent: skill.content,
    };
}
```

**Step 2: Update `importSkill` call site (line ~114)**

Change:
```typescript
const conversion = this.convertSkill(skill, outputFormats as OutputFormat[]);
```
To:
```typescript
const conversion = await this.convertSkill(skill, outputFormats as OutputFormat[], useLm);
```

Add `useLm` parameter to `importSkill`:

```typescript
async importSkill(skill: SkillInfo, outputFormats: string[], generateRegistry: boolean, useLm?: boolean): Promise<void> {
```

**Step 3: Update `importAllSkills` call site (line ~149-152)**

The sync `.map()` becomes an async loop. Change:

```typescript
const conversions = compatibleSkills.map(skill => ({
    skill,
    conversion: this.convertSkill(skill, outputFormats as OutputFormat[]),
}));
```

To:

```typescript
const conversions: Array<{ skill: SkillInfo; conversion: ConversionResult }> = [];
for (const skill of compatibleSkills) {
    conversions.push({
        skill,
        conversion: await this.convertSkill(skill, outputFormats as OutputFormat[], useLm),
    });
}
```

Add `useLm` parameter to `importAllSkills`:

```typescript
async importAllSkills(
    skills: SkillInfo[],
    outputFormats: string[],
    generateRegistry: boolean,
    mcpServers?: McpServerInfo[],
    useLm?: boolean
): Promise<BulkImportResult> {
```

**Step 4: Update `embedSkill` call site (line ~380)**

Change:
```typescript
const conversion = this.convertSkill(skillInfo);
```
To:
```typescript
const conversion = await this.convertSkill(skillInfo);
```

(No LM pass needed for embed — it just re-generates the instructions file.)

**Step 5: Compile and run tests**

Run: `npm run compile && npm run test:unit`
Expected: All existing tests pass. The sync `convertSkill` tests in `importService.test.ts` will need `await` added (see Task 4).

**Step 6: Commit**

```bash
git add src/importService.ts
git commit -m "feat: integrate LM conversion into ImportService"
```

---

### Task 4: Update existing tests for async convertSkill

**Files:**
- Modify: `src/test/unit/importService.test.ts` (convertSkill test block, lines ~18-80)

**Step 1: Add `await` to all `convertSkill` calls in tests**

Every test calling `service.convertSkill(...)` needs to become `async` and use `await`:

```typescript
// Before:
const result = service.convertSkill(makeSkill());

// After:
const result = await service.convertSkill(makeSkill());
```

Update all test functions in the `ImportService.convertSkill` describe block to be async:

```typescript
it('should return a ConversionResult with all required fields', async () => {
    const result = await service.convertSkill(makeSkill());
    // ... assertions unchanged
});
```

**Step 2: Run tests**

Run: `npm run compile && npm run test:unit`
Expected: All 226+ tests pass

**Step 3: Commit**

```bash
git add src/test/unit/importService.test.ts
git commit -m "test: update convertSkill tests for async"
```

---

### Task 5: Pass `useLm` from extension commands to ImportService

**Files:**
- Modify: `src/extension.ts` (importSkill and importAllSkills command handlers)

**Step 1: Thread `useLmConversion` setting through command handlers**

Find the `copilotSkillBridge.importSkill` command handler. Change:

```typescript
await importService.importSkill(item.skillInfo, outputFormats, generateRegistry);
```

To:

```typescript
const { useLmConversion } = getConfig();
await importService.importSkill(item.skillInfo, outputFormats, generateRegistry, useLmConversion);
```

Do the same for `copilotSkillBridge.importAllSkills`. Find where it calls `importService.importAllSkills(...)` and add `useLmConversion` as the last argument.

**Step 2: Compile and run all tests**

Run: `npm run compile && npm test`
Expected: All unit + integration tests pass

**Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: thread useLmConversion setting to import commands"
```

---

### Task 6: Run full test suite and verify

**Step 1: Compile**

Run: `npm run compile`
Expected: Exit 0, no errors

**Step 2: Run unit tests**

Run: `npm run test:unit`
Expected: All tests pass (226+)

**Step 3: Run integration tests**

Run: `npm run test:integration`
Expected: All 15 tests pass

**Step 4: Manual smoke test**

1. Open the extension in VS Code (F5)
2. Import a skill with `useLmConversion: true` and Copilot available — verify content is rephrased
3. Import a skill with `useLmConversion: false` — verify regex-only conversion
4. Import a skill without Copilot installed — verify silent fallback to regex

**Step 5: Commit any fixes, then final commit**

```bash
git add -A
git commit -m "feat: LM-enhanced skill conversion complete"
```
