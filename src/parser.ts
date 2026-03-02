export interface ParsedSkill {
    name: string;
    description: string;
    body: string;
}

export function parseSkillFrontmatter(content: string): ParsedSkill {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
        return { name: '', description: '', body: content };
    }

    const frontmatter = match[1];
    const body = match[2];

    const nameMatch = frontmatter.match(/^name:\s*['"]?(.+?)['"]?\s*$/m);
    const descMatch = frontmatter.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);

    return {
        name: nameMatch?.[1]?.trim() ?? '',
        description: descMatch?.[1]?.trim() ?? '',
        body: body.trimStart(),
    };
}
