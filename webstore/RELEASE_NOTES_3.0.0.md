# TidyMarks AI 3.0.0 Release Notes

## 中文

TidyMarks AI 3.0.0 重点打磨界面流程和设置路径，让扩展更简洁、更直接。

- 弹窗改为“预览整理 -> 应用方案”的主流程，避免默认按钮含义不清
- 配置不完整时，弹窗主按钮会直接进入设置页
- DeepSeek 等慢响应模型超时后，会自动降低当前批大小并重试
- API 检测成功后自动保存当前连接配置
- 整理规则页默认只保留常用项，高级规则收起到 Advanced
- 优化中英文标签、状态文案、间距、颜色和移动端表单表现
- 清理旧版结果详情视图遗留代码

适合商店后台的简短版本：

3.0.0 优化了核心使用路径：先预览，再应用方案。设置页更简洁，API 检测成功后会保存连接配置；慢模型超时会自动降批重试，高级规则默认收起，整体界面更清晰紧凑。

## English

TidyMarks AI 3.0.0 focuses on a simpler, more polished workflow.

- The popup now uses a clear `Preview` -> `Apply Plan` primary flow
- Incomplete setup routes directly from the popup to settings
- Slow providers such as DeepSeek automatically retry the current batch with a smaller batch size after timeouts
- Successful API tests now save the verified connection settings
- Everyday organization rules stay visible while advanced rules are collapsed
- Refined bilingual labels, status copy, spacing, colors, and responsive form behavior
- Removed legacy popup result-view code

Short version for store release notes:

3.0.0 streamlines the core workflow: preview first, then apply the plan. Settings are cleaner, successful API tests save the connection, slow model timeouts retry with smaller batches, advanced rules are collapsed by default, and the interface is more compact and easier to scan.
