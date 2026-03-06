# Changelog

## [0.19.2](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.19.1...copilot-skill-bridge-v0.19.2) (2026-03-06)


### Bug Fixes

* marketplace UX improvements ([9537278](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/95372785070d847d086ceb12f582568fd92ff122))
* marketplace UX improvements ([3445521](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/34455215382cd3d9b0da98c6be328351afc91314))
* use generic labels for import/remove to cover skills and MCP servers ([c80b9ed](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/c80b9ed8824f76102891107bdbf273cd4c749872))


### Documentation

* update README for new commands and label changes ([4d2e171](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/4d2e171176f56ee902f22047af793bf656b386c6))

## [0.19.1](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.19.0...copilot-skill-bridge-v0.19.1) (2026-03-06)


### Bug Fixes

* hide Remove Marketplace for local cache plugins ([a9bc5f1](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/a9bc5f1c49cbc87cf1edf2878def4e8c92ca1025))
* hide Remove Marketplace option for local cache plugins ([e275607](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/e2756077b0a468957656cf517a18708fe895f0df))

## [0.19.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.18.1...copilot-skill-bridge-v0.19.0) (2026-03-06)


### Features

* add output channel logging and BFS dependency tests ([1d5132a](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/1d5132af4f41cd1f71b75483b8e13c55ccb75e7a))

## [0.18.1](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.18.0...copilot-skill-bridge-v0.18.1) (2026-03-06)


### Bug Fixes

* update sidebar immediately on marketplace removal ([5c12d14](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/5c12d14b7742a324288bff3bd337f7e0321ee7ff))
* update sidebar immediately on marketplace removal ([c0dd7e9](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/c0dd7e910d37932bf607a9958fc1e6e90781a48f))

## [0.18.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.17.0...copilot-skill-bridge-v0.18.0) (2026-03-06)


### Features

* add transitive dependency resolution and MCP server discovery ([628815c](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/628815c2626d6c0f7b0fcadbb5ff219d7dd71149))
* companion files, dependency resolution, and MCP discovery ([b04d4e2](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/b04d4e2c4231fd8a5d542f00d265cc46b34d70de))
* progressive rendering for plugin discovery ([b04f3ed](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/b04f3ed920f227028ccc482de26859ec377a399b))


### Bug Fixes

* avoid redundant plugin.json fetch in remote discovery ([207b7d2](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/207b7d20dfa92be787fb59fce90e7166aa53af79))
* increase integration test timeout for activation ([eeabd8f](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/eeabd8f23dec18226f8f828d0aecfa29d55d708a))


### Performance

* parallelize GitHub API calls and cache auth token ([154501b](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/154501bc251faaed6e87c5d2dfae011bda8b738a))


### Documentation

* update README and remove hardcoded default marketplace ([6d2c33d](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/6d2c33dbaa77bf5cadcaa210d9d2d9d553280b39))
* update README and remove hardcoded obra/superpowers default ([d1d21e8](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/d1d21e8c014b281c860da03f4b57bfd65e8cd1f7))

## [0.17.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.16.1...copilot-skill-bridge-v0.17.0) (2026-03-06)


### Features

* add companionFiles field to SkillInfo type ([33dd868](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/33dd8682b34fd26843e388b6200e4a514fa6b794))
* add companionFiles to SkillInfo and add types test ([fdca6d7](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/fdca6d72509eaa1225e75d0888df8a89df9ce4f8))
* companion files, CLI conversion, and subagent fix ([5d78144](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/5d78144d32e2bac20c7f0218be48c8d1741341ff))
* discover companion .md files from remote GitHub repos ([d6c5db7](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/d6c5db728dcf5d865b5fdb7be38976013667a99d))
* discover companion .md files in local skill directories ([3ca3be4](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/3ca3be41c63375d74b6391a29a89c5bfa9a8c900))
* write and clean up companion files on skill import/removal ([a776c74](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/a776c74dd497e85542e8fd45c74b3a686cb25bd9))

## [0.16.1](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.16.0...copilot-skill-bridge-v0.16.1) (2026-03-05)


### Bug Fixes

* show loading indicator instead of welcome view during refresh ([#51](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/51)) ([99890d0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/99890d0f12499a4648a4def38ed23fa07a72516c))

## [0.16.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.15.0...copilot-skill-bridge-v0.16.0) (2026-03-05)


### Features

* add Context Over Tools and fix embed/unembed registry updates ([#48](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/48)) ([9e283af](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/9e283afec6d39980a9633c50a13dfa17e41ad8f0))

## [0.15.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.14.1...copilot-skill-bridge-v0.15.0) (2026-03-05)


### Features

* LM-enhanced skill conversion via Copilot Language Model API ([#45](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/45)) ([3994929](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/3994929a4e0bd2e816455ba8560031f63e814647))

## [0.14.1](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.14.0...copilot-skill-bridge-v0.14.1) (2026-03-05)


### Bug Fixes

* show auth errors and welcome view when sidebar is empty ([#43](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/43)) ([93e08cd](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/93e08cddb5df18a3f9ffbf8afb810bd2fad1796b))

## [0.14.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.13.1...copilot-skill-bridge-v0.14.0) (2026-03-04)


### Features

* registry improvements, sidebar refresh, and Claude reference cleanup ([#41](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/41)) ([9b0ee21](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/9b0ee21a5f005663e4814882e7fb77bf7b0047a2))

## [0.13.1](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.13.0...copilot-skill-bridge-v0.13.1) (2026-03-04)


### Bug Fixes

* allow meta-orchestrator skills and remove duplicate Cancel button ([#39](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/39)) ([da1681c](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/da1681c0afc8ba28e35389c28221a2204d6b7bd7))

## [0.13.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.12.0...copilot-skill-bridge-v0.13.0) (2026-03-04)


### Features

* bulk remove and fix registry table output ([#37](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/37)) ([f865a0e](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/f865a0ee6cbd06bd917d7f701b4babcb5e32399a))

## [0.12.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.11.1...copilot-skill-bridge-v0.12.0) (2026-03-03)


### Features

* add bulk remove at plugin and marketplace level ([#35](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/35)) ([0c26c4a](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/0c26c4ad746475f954ff80906a07ee9c83adec27))

## [0.11.1](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.11.0...copilot-skill-bridge-v0.11.1) (2026-03-03)


### Documentation

* update README with embed, preview, and source repo features ([#33](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/33)) ([f2028fd](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/f2028fdc0cca194a2c20cdae98fd6db735b0adc9))

## [0.11.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.10.1...copilot-skill-bridge-v0.11.0) (2026-03-03)


### Features

* embed skill content in copilot-instructions.md ([#31](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/31)) ([5e78e59](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/5e78e59d9e3cc8f1d549eb276e4cfe4f222b2784))

## [0.10.1](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.10.0...copilot-skill-bridge-v0.10.1) (2026-03-03)


### Bug Fixes

* skill preview showing empty content due to URI key mismatch ([#29](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/29)) ([34eb1b2](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/34eb1b2c5de26dc1c98c5f11922b1aa6e247e8e2))

## [0.10.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.9.0...copilot-skill-bridge-v0.10.0) (2026-03-03)


### Features

* convert MCP tool references and fix cross-reference format ([#27](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/27)) ([f908b1a](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/f908b1a7058a0cd92499784b8b61e36485bfac96))

## [0.9.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.8.0...copilot-skill-bridge-v0.9.0) (2026-03-03)


### Features

* skill content preview, source repo link, AskUserQuestion fix ([#24](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/24)) ([3ab0684](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/3ab068444ae7b21effbdae4cb4ba7069e07b930c))

## [0.8.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.7.0...copilot-skill-bridge-v0.8.0) (2026-03-03)


### Features

* show skill content on click in tree view ([#22](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/22)) ([656a548](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/656a548987dc7e4d73d2563fc6f14bc8024d7e5c))

## [0.7.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.6.0...copilot-skill-bridge-v0.7.0) (2026-03-03)


### Features

* add tooltips and right-click context menus to tree view ([#19](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/19)) ([8b8cf62](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/8b8cf624a933a8c536affbe2440501f6719718af))


### Documentation

* update README with all current features ([#21](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/21)) ([f853a0a](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/f853a0ac8ef5e012004fedf8ee68a5907eff138f))

## [0.6.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.5.0...copilot-skill-bridge-v0.6.0) (2026-03-03)


### Features

* smart skill conversion with compatibility analysis ([#17](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/17)) ([168b95a](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/168b95ab1f710303f42ef8ee8148d1a2d16eb5e7))

## [0.5.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.4.2...copilot-skill-bridge-v0.5.0) (2026-03-02)


### Features

* group plugins under marketplace nodes in tree view ([#15](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/15)) ([44348dc](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/44348dce29b98a73eb8230701697f54b9d2e3b58))

## [0.4.2](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.4.1...copilot-skill-bridge-v0.4.2) (2026-03-02)


### Bug Fixes

* support alternate marketplace.json formats ([#13](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/13)) ([3dc5ea5](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/3dc5ea5b4336a1f477c295d2e2391f8e7b333f6d))

## [0.4.1](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.4.0...copilot-skill-bridge-v0.4.1) (2026-03-02)


### Bug Fixes

* fetch repo star counts for marketplace search ([#11](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/11)) ([13a6e3e](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/13a6e3eee176b84a2a9d28a03f05f5f69f6713c5))

## [0.4.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.3.0...copilot-skill-bridge-v0.4.0) (2026-03-02)


### Features

* improve skill import UX with diff cleanup and batch import ([#9](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/9)) ([3a21a8e](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/3a21a8e2be53b5b36cb7e61eab5605165bfa6945))

## [0.3.0](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/compare/copilot-skill-bridge-v0.2.3...copilot-skill-bridge-v0.3.0) (2026-03-02)


### Features

* add GitHub marketplace search to Add Marketplace command ([#7](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/issues/7)) ([8a73535](https://github.com/MarcelRoozekrans/Copilot-Skill-Bridge/commit/8a735358a0d33b7e8e7d96698b6b121cac5e418f))

## [0.2.3](https://github.com/MarcelRoozekrans/CopilotBridge/compare/copilot-skill-bridge-v0.2.2...copilot-skill-bridge-v0.2.3) (2026-03-02)


### Bug Fixes

* re-read config on each refresh so new marketplaces take effect ([#5](https://github.com/MarcelRoozekrans/CopilotBridge/issues/5)) ([48ec873](https://github.com/MarcelRoozekrans/CopilotBridge/commit/48ec8735e2bf2058a86b69c94ed20211b6724c2c))

## [0.2.2](https://github.com/MarcelRoozekrans/CopilotBridge/compare/copilot-skill-bridge-v0.2.1...copilot-skill-bridge-v0.2.2) (2026-03-02)


### Bug Fixes

* merge MCP servers from remote plugins during discovery ([#3](https://github.com/MarcelRoozekrans/CopilotBridge/issues/3)) ([534fb0a](https://github.com/MarcelRoozekrans/CopilotBridge/commit/534fb0a1999a6186d5868378816b81fada81502d))

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
