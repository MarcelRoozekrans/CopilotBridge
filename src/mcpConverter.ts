import { McpServerInfo } from './types';

export interface VsCodeMcpServerEntry {
    type: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
}

export interface VsCodeInput {
    id: string;
    type: 'promptString';
    description: string;
    password: boolean;
}

export interface VsCodeMcpConfig {
    servers: Record<string, VsCodeMcpServerEntry>;
    inputs: VsCodeInput[];
}

const SECRET_NAME_PATTERN = /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i;
const SECRET_VALUE_PATTERN = /^\$\{.+\}$|^sk-|^ghp_|^gho_|^github_pat_/;

function isSecretEnvVar(name: string, value: string): boolean {
    return SECRET_NAME_PATTERN.test(name) || SECRET_VALUE_PATTERN.test(value);
}

export function convertMcpServers(servers: McpServerInfo[]): VsCodeMcpConfig {
    const result: VsCodeMcpConfig = { servers: {}, inputs: [] };
    const inputIds = new Set<string>();

    for (const server of servers) {
        const { config } = server;

        if (config.url) {
            result.servers[server.name] = {
                type: 'sse',
                url: config.url,
            };
        } else {
            const processedEnv: Record<string, string> = {};

            if (config.env) {
                for (const [key, value] of Object.entries(config.env)) {
                    if (isSecretEnvVar(key, value)) {
                        const inputId = `${server.name}-${key}`;
                        processedEnv[key] = `\${input:${inputId}}`;

                        if (!inputIds.has(inputId)) {
                            inputIds.add(inputId);
                            result.inputs.push({
                                id: inputId,
                                type: 'promptString',
                                description: `Enter ${key} for ${server.name}`,
                                password: true,
                            });
                        }
                    } else {
                        processedEnv[key] = value;
                    }
                }
            }

            result.servers[server.name] = {
                type: 'stdio',
                command: config.command,
                args: config.args,
                ...(Object.keys(processedEnv).length > 0 ? { env: processedEnv } : {}),
            };
        }
    }

    return result;
}
