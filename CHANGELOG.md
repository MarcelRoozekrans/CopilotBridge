# Changelog

## [0.2.1](https://github.com/MarcelRoozekrans/CopilotBridge/compare/copilot-skill-bridge-v0.2.0...copilot-skill-bridge-v0.2.1) (2026-03-02)


### Bug Fixes

* add MCP server discovery to remote marketplace reader ([537c2d5](https://github.com/MarcelRoozekrans/CopilotBridge/commit/537c2d57f68f9a31943a7b988e6df2acda99521e))
* **ci:** add publish job to release-please workflow ([a663f8a](https://github.com/MarcelRoozekrans/CopilotBridge/commit/a663f8a625a3c48751191493eedfc14e795c9866))

## [0.2.0](https://github.com/MarcelRoozekrans/CopilotBridge/compare/copilot-skill-bridge-v0.1.0...copilot-skill-bridge-v0.2.0) (2026-03-02)


### Features

* add context menus and icons to TreeView ([2722730](https://github.com/MarcelRoozekrans/CopilotBridge/commit/272273030c061cd00c51f2a39bcdabc628c2376d))
* add conversion engine for Claude-to-Copilot transformation ([c596af2](https://github.com/MarcelRoozekrans/CopilotBridge/commit/c596af2fc9953a46550691bb92e37b144d8fc499))
* add core type definitions ([91e314a](https://github.com/MarcelRoozekrans/CopilotBridge/commit/91e314ac503edd5028a1a2acbed9a46b00256273))
* add file writer and registry generator ([81bb5a7](https://github.com/MarcelRoozekrans/CopilotBridge/commit/81bb5a7c05e0bb2a67538e17e177043518426622))
* add GitHub authentication via VS Code auth API ([c84c6ae](https://github.com/MarcelRoozekrans/CopilotBridge/commit/c84c6ae52c9674be1c154291feab08d086f042e3))
* add import service orchestrator ([0bdad7e](https://github.com/MarcelRoozekrans/CopilotBridge/commit/0bdad7e8f17475fd685d5a8f6425bd33a615dd5e))
* add integration test infrastructure and extension lifecycle tests ([4bf6270](https://github.com/MarcelRoozekrans/CopilotBridge/commit/4bf62709676c0a6d32cc7532c52cf7feab814a41))
* add local Claude plugin cache reader ([cc27ad3](https://github.com/MarcelRoozekrans/CopilotBridge/commit/cc27ad38c67d9094faed3f7957839d574fb28709))
* add marketplace metadata, README, and packaging support ([5c6f86f](https://github.com/MarcelRoozekrans/CopilotBridge/commit/5c6f86f0081e5237f0ef1e94fe4e3c2bbda3b033))
* add MCP config writer with merge and removal logic ([f93eeeb](https://github.com/MarcelRoozekrans/CopilotBridge/commit/f93eeebd221a184da88a1f641aebc6ae3ef8bb43))
* add MCP converter with stdio, HTTP, and secret detection ([1592b02](https://github.com/MarcelRoozekrans/CopilotBridge/commit/1592b020d6c76c56790a15ff91a66a2074bc3acd))
* add MCP import/remove methods to ImportService ([e587ac4](https://github.com/MarcelRoozekrans/CopilotBridge/commit/e587ac420a96303be0fa952dccf0601091349cb9))
* add MCP server nodes to TreeView ([9bac43e](https://github.com/MarcelRoozekrans/CopilotBridge/commit/9bac43e8d2c5f8d9989983a608afd272e306fe19))
* add MCP server state management functions ([81ffb04](https://github.com/MarcelRoozekrans/CopilotBridge/commit/81ffb04c4ffabc3543e345629e8a70a93651ca97))
* add MCP server type definitions and update manifest schema ([1aefddd](https://github.com/MarcelRoozekrans/CopilotBridge/commit/1aefddd88240e53b1cbe8cfa26a7a314c11ec261))
* add remote GitHub skill reader ([3639541](https://github.com/MarcelRoozekrans/CopilotBridge/commit/3639541b525aac98bf56e6b8cb46e760087a9ad3))
* add skill frontmatter parser ([e9542de](https://github.com/MarcelRoozekrans/CopilotBridge/commit/e9542de29676c03057513a0a86b3583b0719fd8d))
* add state manager for tracking skill imports ([fc4b85b](https://github.com/MarcelRoozekrans/CopilotBridge/commit/fc4b85be9e83344da40821d279d6475b0683fce9))
* add TreeView provider for skill browser sidebar ([101f91c](https://github.com/MarcelRoozekrans/CopilotBridge/commit/101f91c778564f9dccffaa874692ff15cd25dcc4))
* add update watcher for local cache and remote repos ([c7395ab](https://github.com/MarcelRoozekrans/CopilotBridge/commit/c7395ab828743b2582c5670f8beb630b55148049))
* discover MCP servers from .mcp.json in plugin cache ([c3ece40](https://github.com/MarcelRoozekrans/CopilotBridge/commit/c3ece404ed9536c0e67bc8109c8bf07e84f4fb34))
* redesign logo as suspension bridge and add activity bar icon ([3439b11](https://github.com/MarcelRoozekrans/CopilotBridge/commit/3439b115a50a26ae965d39296004208db3a09b89))
* register MCP server commands and context menus ([b6f392a](https://github.com/MarcelRoozekrans/CopilotBridge/commit/b6f392acf9cf47e87eef5cffcb7ee0f70d039507))
* wire extension entry point with all components ([dab6da7](https://github.com/MarcelRoozekrans/CopilotBridge/commit/dab6da7fff856c6adc2fbe484eb306bc2bfd4d45))


### Bug Fixes

* register commands even when no workspace folder is open ([ca30f69](https://github.com/MarcelRoozekrans/CopilotBridge/commit/ca30f692c1e74ff3078a9fac95bac5493c4d6aff))


### Refactoring

* make prompt files point to instructions instead of duplicating content ([311df5d](https://github.com/MarcelRoozekrans/CopilotBridge/commit/311df5d4c623dbb226c2af1f5994910ec292ed36))
* reorganize tests into unit/ subdirectory ([625a2c1](https://github.com/MarcelRoozekrans/CopilotBridge/commit/625a2c1ebdfe67158a572d71cccb52fd660ad00d))


### Documentation

* add design and implementation plan for publishing, auth, and testing ([596954a](https://github.com/MarcelRoozekrans/CopilotBridge/commit/596954ab975decd34714d24553f8ec38a5b98d85))
* add design document and implementation plan ([3b1cbb5](https://github.com/MarcelRoozekrans/CopilotBridge/commit/3b1cbb52d339653d4ac5070a083cb9bd163f5d50))
* add GitHub workflows design and implementation plan ([335769f](https://github.com/MarcelRoozekrans/CopilotBridge/commit/335769f5dd6d386d13a44c3ef8f211053c5d940e))

## [0.1.0] - 2026-03-02

### Added
- Initial release
- Local Claude plugin cache discovery
- Remote GitHub marketplace skill discovery
- Skill conversion engine (31+ rules)
- TreeView sidebar with status icons
- Import, remove, and update skill workflows
- GitHub authentication via VS Code auth API
- Copilot instructions and prompts file generation
- Skill registry in copilot-instructions.md
- Integration tests with @vscode/test-electron
