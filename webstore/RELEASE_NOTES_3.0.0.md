# Marko 3.0.0 Release Notes

## 中文

Marko 3.0.0 重点打磨界面流程和设置路径，让扩展更简洁、更直接。

- 弹窗改为“预览整理 -> 应用方案”的主流程，避免默认按钮含义不清
- 应用已生成的预览方案时会复用保存的方案，本地重建，不会再次请求模型
- 如果应用预览时遇到可恢复失败，弹窗会保留应用入口，修复后可直接重试保存方案
- 配置不完整时，弹窗主按钮会直接进入设置页
- DeepSeek 等慢响应模型会在请求前再次拆分大批量，运行批次最多 10 条、单个模型请求最多 5 条，并使用受控小并发、更短的请求超时、更短的内置请求提示和更紧的输出预算；单个小请求超时后会保留已完成结果，只把失败小块继续拆到 1 条重试
- 新增快速/完整速度模式：快速模式跳过失效链接检测和额外目录规划请求，完整模式保留链接检查和全局规划
- 快速模式在规则和分类缓存覆盖全部书签时会直接本地完成，不再调模型或等待批次调度
- 预览会先检查本地规则和缓存覆盖情况，只有未缓存书签需要模型时才要求 API Key 或模型接口授权
- API 检测成功后自动保存当前连接配置
- 弹窗应用方案、备份恢复/删除和设置校验都改成页面内确认与状态提示，不再弹出浏览器原生对话框
- 恢复备份前会先为当前书签创建新的本地快照，并在清理旧备份时保留正在恢复的备份记录
- 设置页加载时，即使备份列表或权限状态刷新失败，也会保留已读取的连接配置并在对应区域提示错误
- 权限状态刷新失败时会恢复按钮并显示页面内错误，避免访问检查一直卡住
- 备份列表重新加载成功后会清除之前的过期错误提示，避免成功列表和旧错误同时显示
- 批大小和自动整理间隔会校验原始输入，避免非法数值被静默改写
- 整理规则页默认只保留常用项，高级规则收起到 Advanced
- 优化中英文标签、状态文案、间距、颜色和移动端表单表现
- 清理旧版结果详情视图遗留代码

适合商店后台的简短版本：

3.0.0 优化了核心使用路径：先预览，再应用方案。应用预览不会再次跑模型；快速模式默认更快且权限更少，并少一次单独目录规划请求，规则和缓存覆盖全部书签时还会直接本地完成，未命中缓存时才要求模型访问；设置页使用内联确认和校验提示，API 检测成功后会保存连接配置，DeepSeek 等慢模型会在请求前再次拆分大批量，运行批次最多 10 条、单请求最多 5 条，并使用受控小并发、更短请求超时、更短内置提示和更紧输出预算；单个小请求超时后会保留已完成结果，只把失败小块继续拆到 1 条重试。

## English

Marko 3.0.0 focuses on a simpler, more polished workflow.

- The popup now uses a clear `Preview` -> `Apply Plan` primary flow
- Applying a ready preview reuses the saved plan and rebuilds locally without another model request
- If applying a saved preview hits a recoverable failure, the popup keeps the apply path available so the saved plan can be retried
- Incomplete setup routes directly from the popup to settings
- Slow providers such as DeepSeek re-split large batches before each request, cap runtime batches at 10 bookmarks, cap each model request at 5 bookmarks, use limited mini-request concurrency, shorter request timeouts, a shorter built-in request prompt, and a tighter output budget; when one mini request times out, completed mini results are kept and only the failed block shrinks down to one-bookmark retries
- Added Fast and Complete speed modes: Fast skips dead-link checks and the extra taxonomy-planning request, while Complete keeps link checks and global planning
- Fast mode now finishes locally when rules and cached classifications cover every bookmark, skipping model calls and batch scheduling
- Preview checks local rule/cache coverage first, then asks for an API key or model endpoint access only when uncached bookmarks need the model
- Successful API tests now save the verified connection settings
- Popup apply, backup restore/delete, and settings validation now use inline confirmations and status messages instead of browser dialogs
- Backup restore now creates a fresh local snapshot of the current bookmarks first and preserves the selected backup while retention cleanup runs
- Settings load keeps the saved connection visible even if backup-list or access-status refreshes fail, then reports those secondary failures inline
- Access-status refresh failures now restore controls and show an inline permission-state error instead of leaving checks stuck
- Successful backup-list refreshes now clear stale backup error text instead of showing a recovered list beside an old error
- Batch size and auto interval fields validate raw input instead of silently clamping invalid values
- Everyday organization rules stay visible while advanced rules are collapsed
- Refined bilingual labels, status copy, spacing, colors, and responsive form behavior
- Removed legacy popup result-view code

Short version for store release notes:

3.0.0 streamlines the core workflow: preview first, then apply the plan without a second model run. Fast mode skips dead-link checks and the extra taxonomy-planning request, finishes locally when rules and cached classifications cover every bookmark, and asks for model access only when uncached bookmarks need it. Settings use inline confirmations and validation feedback, successful API tests save the connection, and slow providers such as DeepSeek re-split large batches before each request, cap runtime batches at 10 bookmarks, cap each model request at 5 bookmarks, use limited mini-request concurrency, shorter request timeouts, shorter built-in prompts, and tighter output budgets. When one mini request times out, completed mini results are kept and only the failed block shrinks down to one-bookmark retries.
