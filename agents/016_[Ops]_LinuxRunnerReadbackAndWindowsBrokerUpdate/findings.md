# 发现
- 生产 D1 可只读确认 runner heartbeat、held/revoked 状态和 queued/running GitHub/native jobs；这些数据不能证明 host-local systemd 服务、进程或 source revision。
- 既有 Windows stage 的前置门禁核实 f929 helper tasks 的实际 bfe613abb3c4 wrapper，并在两 root 全部满足精确 PID/service/user gate 后再登记并启动 idle-safe updater。目标固定为 0403aafc7306ef6dad8d2b2acca0cb5e90b2f17b。
- ARM64 diagnostic 仅读取 gitedge-runner-broker.service 的固定 systemd 属性、exact broker argv/root/revision/UID、source/action lock 与 sudo/systemd-run 权限布尔值；不运行或注册 transient unit。
- 探针输出禁止包含环境变量、SSH凭据、service完整日志、任意异常消息或未筛选 argv。
