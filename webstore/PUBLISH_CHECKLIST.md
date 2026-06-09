# 上架前检查单

## 代码与权限
- [ ] 在 `chrome://extensions` 中重新加载扩展
- [ ] 真实扩展回归优先使用 `chrome://extensions` 的手动 `Load unpacked`；当前 Google Chrome 命令行会提示 `--load-extension is not allowed in Google Chrome, ignoring.`，不要把这种 CLI 启动当作已加载扩展
- [ ] 如需自动化真实扩展 E2E，运行 `npm run e2e:extension`，使用允许 `--load-extension` 的 Chrome for Testing 或 Chromium；标准位置没有浏览器时先运行 `npm run install:e2e-browser` 安装 Playwright Chromium，E2E 会检查 Playwright 缓存和 `PLAYWRIGHT_BROWSERS_PATH`；自动化默认 headless 后台运行，只有调试时才设置 `MARKO_SHOW_BROWSER=1`；并确认 Marko 的 service worker 是 `background.js`，临时书签可完成真实弹窗预览/应用点击流、慢任务一键切到快速模式恢复、真实弹窗未处理项删除点击流、真实设置页备份创建/恢复/删除点击流、100 条书签快速模式规模用例、手动备份、快速预览、应用方案、重复清理、备份记录、真实设置页保存和 DeepSeek 批量压低验证
- [ ] 最终候选发布前运行 `npm run verify:release:full`，把常规发布门禁和真实扩展冒烟测试串起来
- [ ] 首次点击“预览整理”时确认运行时权限弹窗正常出现
- [ ] 拒绝权限后，弹窗能给出明确提示
- [ ] 设置页开启自动整理时，若未授权网站访问，会被拦截并提示
- [ ] 重新授权网站访问后，自动整理闹钟会恢复

## UI 自适应
- [ ] 运行 `npm run audit:ui`
- [ ] 弹窗在 320px、360px、400px 宽度下没有横向滚动，顶部状态、速度模式、主操作按钮、错误提示都不裁切
- [ ] 设置页在 390px、720px、1280px 宽度下没有横向滚动，连接区、整理规则区、自动化区、备份区、长错误提示和长服务商/模型值不会撑宽页面
- [ ] 中英文界面都检查一次长状态文案、权限失败文案、备份恢复确认和未处理项按钮

## 功能回归
- [ ] 手动备份
- [ ] 恢复备份
- [ ] 删除备份
- [ ] API 检测
- [ ] 设置页非法批大小、非法自动整理间隔会显示页面内错误，不会静默改写
- [ ] 弹窗应用方案、备份恢复、备份删除均使用页面内确认，不出现浏览器原生弹窗
- [ ] 应用已生成预览时不会再次请求模型
- [ ] 白名单跳过
- [ ] 自动整理
- [ ] 应用预览方案和自动整理重建前都会自动备份
- [ ] 整理后直接写入根目录
- [ ] 待手动分类与未处理明细

## Chrome Web Store 后台
- [ ] 上传 128x128 图标
- [ ] UI 或商店文案改动后运行 `npm run render:store-assets`，用 `playwright-core` 和已安装的 Chrome/Chrome for Testing 后台重新生成 README 截图和 Chrome Web Store 宣传图
- [ ] 上传截图
- [ ] 确认 `npm run verify:release` 已校验商店文案、隐私政策、审核备注、发布清单、截图、宣传图和图标尺寸
- [ ] 填写简短描述与详细描述
- [ ] 填写单一用途说明
- [ ] 填写隐私政策 URL
- [ ] 在隐私披露里说明书签、第三方 AI 服务、失效链接检测三类数据流
- [ ] 在权限说明里说明运行时申请的网站访问权限用途

## 打包建议
- [ ] 提交前删除无关临时文件
- [ ] 运行 `npm run verify:release`
- [ ] 运行 `node webstore/build_extension_package.mjs`
- [ ] 确认压缩包根目录直接包含 `manifest.json`
- [ ] 只把 `webstore/EXTENSION_PACKAGE_FILES.json` 中列出的运行文件放入扩展上传包
- [ ] 不要把 `docs/`、`tests/`、`webstore/`、README 或生成脚本放入扩展上传包
- [ ] `webstore/` 文档只保留在仓库中，方便后续复审或更新版本时复用
