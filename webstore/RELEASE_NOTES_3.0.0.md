# Marko 3.0.0 Release Notes

## 中文

Marko 3.0.0 重点打磨界面流程和设置路径，让扩展更简洁、更直接。

- 弹窗改为“预览整理 -> 应用方案”的主流程，避免默认按钮含义不清
- 配置不完整时，弹窗主按钮会直接进入设置页
- DeepSeek 等慢响应模型超时后，会自动降低当前批大小并重试
- 新增快速/完整速度模式：快速模式跳过失效链接检测并减少权限，完整模式保留链接检查
- API 检测成功后自动保存当前连接配置
- 整理规则页默认只保留常用项，高级规则收起到 Advanced
- 优化中英文标签、状态文案、间距、颜色和移动端表单表现
- 清理旧版结果详情视图遗留代码

适合商店后台的简短版本：

3.0.0 优化了核心使用路径：先预览，再应用方案。新增快速/完整速度模式，默认更快且权限更少；设置页更简洁，API 检测成功后会保存连接配置，慢模型超时会自动降批重试。

## English

Marko 3.0.0 focuses on a simpler, more polished workflow.

- The popup now uses a clear `Preview` -> `Apply Plan` primary flow
- Incomplete setup routes directly from the popup to settings
- Slow providers such as DeepSeek automatically retry the current batch with a smaller batch size after timeouts
- Added Fast and Complete speed modes: Fast skips dead-link checks and reduces permissions, while Complete keeps link checks
- Successful API tests now save the verified connection settings
- Everyday organization rules stay visible while advanced rules are collapsed
- Refined bilingual labels, status copy, spacing, colors, and responsive form behavior
- Removed legacy popup result-view code

Short version for store release notes:

3.0.0 streamlines the core workflow: preview first, then apply the plan. Fast mode now skips dead-link checks for quicker runs and fewer permissions, while Complete mode keeps link checks. Settings are cleaner, successful API tests save the connection, and slow model timeouts retry with smaller batches.
