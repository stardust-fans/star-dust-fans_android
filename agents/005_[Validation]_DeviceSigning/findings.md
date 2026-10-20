# 发现
- 当前主机 Windows；ADB 36 可用。列出 USB 和网络两个 transport，设备型号相同，须先核对 ro.serialno，避免误认为两台设备。
- PATH 有既有 Get-Sign 脚本；需先核实其证书类型，不将 Windows Authenticode 证书冒充 Apple Development 身份。
- Windows 未发现 codesign / xcodebuild / zsign，Apple 真机包须使用 iphoneos 构建，不能给已交付 iphonesimulator 包重新签名后冒充 IPA。
- 用户已授权使用其现有 dev 证书和 ADB 本机测试；不撤销/新建证书，不上传私钥到 GitHub secret 或其他外部服务，若确需此类权限另行说明。
