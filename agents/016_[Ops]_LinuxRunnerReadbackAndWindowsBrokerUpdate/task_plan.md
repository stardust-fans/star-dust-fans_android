# 执行计划
- [x] 核对生产 runner 的 D1 活动状态与现有维护控制器，不打断活跃任务。
- [x] 生成固定 Windows 更新与 ARM64 主机只读诊断 workflow。
- [ ] 用 GitEdge 实际 workflow parser 校验两个 payload 与单 job/只读权限契约。
- [ ] 在独立 Android worktree 安装固定 controller，运行本地检查并提交。
- [ ] 推送任务分支并只派发固定 Windows stage 与 ARM64 只读诊断。
- [ ] 分别核验 stage/helper 状态、Windows receipt/PID/HEAD/锁/heartbeat 和 ARM 主机只读结果。
