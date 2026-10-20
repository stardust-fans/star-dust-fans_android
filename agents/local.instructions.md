---
description: Always Load
applyTo: '**'
---
# 项目规则
- 使用中文或英文。代码中不加入个人信息。
- 修改前维护任务计划，详细依据与操作记录只保存在 agents。
- 所有测试放在仓库根 test。
- 子任务使用独立 worktree，分别提交后在本地合并 main，不开 PR。
- worktree 默认使用 /Users/user/.codex/worktrees/<repository>/<task>；Windows 下解析为 C:/Users/user/.codex/worktrees/<repository>/<task>。先查询已占用路径，不移动或删除已有 worktree。
- 子 agent 禁止使用 sol；常规实现使用 luna / medium。
- 不提交无关修改、不 force push；确认 main 保护状态后才能推送。
- 不加兼容层、migration 或不必要的配置；使用现有成熟技术。
- 任务编号、操作记录、决策依据只放 agents；提交和代码不添加模型署名或来源标记。
- 用户已确认 Apple 端沿用原生导航加 WKWebView 架构，复用网页全部功能。
