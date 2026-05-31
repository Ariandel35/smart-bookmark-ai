# Marko 3.0.0 Release Notes

## 中文

Marko 3.0.0 重点打磨界面流程和设置路径，让扩展更简洁、更直接。

- 弹窗改为“预览整理 -> 应用方案”的主流程，避免默认按钮含义不清
- 应用已生成的预览方案时会复用保存的方案，本地重建，不会再次请求模型
- 如果应用预览时遇到可恢复失败，弹窗会保留应用入口，修复后可直接重试保存方案
- 配置不完整时，弹窗主按钮会直接进入设置页
- DeepSeek 和 DeepSeek 兼容接口会跳过单独目录规划请求，在请求前再次拆分大批量，运行批次最多 15 条、单个模型请求最多 5 条，并最多 3 个小请求并发处理；如果模型仍然超时，本轮会停止等待模型，改用本地规则、缓存、内置规则和待手动分类兜底完成
- 新增快速/完整速度模式：快速模式跳过失效链接检测、额外目录规划请求和模型等待，完整模式保留链接检查、全局规划和 AI 分类
- 快速模式会直接本地完成预览；规则和缓存无法确定的书签会进入待手动分类，不再因为慢模型排队而卡住
- 预览会先检查本地规则和缓存覆盖情况；快速模式不要求模型接口授权，完整模式只有未缓存书签需要 AI 分类时才要求 API Key 或模型接口授权
- 快速自动整理现在可以不填 API Key 本地运行；完整自动整理仍要求模型凭据和网站访问权限
- API 检测成功后自动保存当前连接配置
- 弹窗应用方案、备份恢复/删除和设置校验都改成页面内确认与状态提示，不再弹出浏览器原生对话框
- 预览阶段的未处理项保持只读，不会在点击“应用方案”前显示保留/删除操作
- 恢复备份前会先为当前书签创建新的本地快照，并在清理旧备份时保留正在恢复的备份记录
- 设置页加载时，即使备份列表或权限状态刷新失败，也会保留已读取的连接配置并在对应区域提示错误
- 权限状态刷新失败时会恢复按钮并显示页面内错误，避免访问检查一直卡住
- 备份列表重新加载成功后会清除之前的过期错误提示，避免成功列表和旧错误同时显示
- 备份创建、恢复或删除成功后，如果列表刷新失败，会保留已完成的操作提示，并在备份列表区域显示加载错误
- 批大小和自动整理间隔会校验原始输入，避免非法数值被静默改写
- 整理规则页默认只保留常用项，高级规则收起到 Advanced
- 优化中英文标签、状态文案、间距、颜色和移动端表单表现
- 清理旧版结果详情视图遗留代码

适合商店后台的简短版本：

3.0.0 优化了核心使用路径：先预览，再应用方案。应用预览不会再次跑模型；快速模式默认更快且权限更少，会跳过失效链接检测、单独目录规划和模型等待，未命中本地规则的书签进入待手动分类，快速自动整理也可不填 API Key 本地运行；设置页使用内联确认和校验提示，API 检测成功后会保存连接配置，完整模式下 DeepSeek 和 DeepSeek 兼容接口会跳过单独目录规划请求，在请求前再次拆分大批量，运行批次最多 15 条、单请求最多 5 条，并最多 3 个小请求并发处理；如果模型仍然超时，本轮会停止等待模型并改用本地兜底继续完成。

## English

Marko 3.0.0 focuses on a simpler, more polished workflow.

- The popup now uses a clear `Preview` -> `Apply Plan` primary flow
- The popup now includes a Fast/Complete mode switch, so users can change speed or quality before preview without opening settings
- Applying a ready preview reuses the saved plan and rebuilds locally without another model request
- If applying a saved preview hits a recoverable failure, the popup keeps the apply path available so the saved plan can be retried
- Backup failures before applying a saved preview also keep the saved preview retry path available
- Apply Plan retry is shown only for preview-apply failures, not unrelated error states that merely still have a saved preview
- Incomplete setup routes directly from the popup to settings
- Slow providers such as DeepSeek and DeepSeek-compatible endpoints skip the separate taxonomy-planning request, re-split large batches before each request, cap runtime batches at 15 bookmarks, cap each model request at 5 bookmarks, and run up to three mini requests at a time; if the model still times out, the run stops waiting for the model and finishes with local rules, cache, built-in rules, and manual review
- Added Fast and Complete speed modes: Fast skips dead-link checks, the extra taxonomy-planning request, and model waiting, while Complete keeps link checks, global planning, and AI classification
- Fast mode now finishes previews locally; bookmarks that custom rules, cache, and built-in domain rules cannot classify go to manual review instead of blocking on a slow model queue
- Preview checks local rule/cache coverage first; Fast mode does not ask for model endpoint access, and Complete asks only when uncached bookmarks need AI classification
- Fast automatic organize can now run locally without an API key; Complete automatic organize still requires model credentials and website access
- Successful API tests now save the verified connection settings
- Popup apply, backup restore/delete, and settings validation now use inline confirmations and status messages instead of browser dialogs
- Unprocessed items stay read-only until an organize/apply run completes, so preview and error states cannot mutate bookmarks
- Backup restore now creates a fresh local snapshot of the current bookmarks first and preserves the selected backup while retention cleanup runs
- Settings load keeps the saved connection visible even if backup-list or access-status refreshes fail, then reports those secondary failures inline
- Access-status refresh failures now restore controls and show an inline permission-state error instead of leaving checks stuck
- Successful backup-list refreshes now clear stale backup error text instead of showing a recovered list beside an old error
- Backup create, restore, and delete actions now preserve the completed action message if the follow-up list refresh fails, while the backup list shows the load error inline
- Batch size and auto interval fields validate raw input instead of silently clamping invalid values
- Everyday organization rules stay visible while advanced rules are collapsed
- Refined bilingual labels, status copy, spacing, colors, and responsive form behavior
- Removed legacy popup result-view code

Short version for store release notes:

3.0.0 streamlines the core workflow: preview first, switch Fast/Complete directly in the popup when needed, then apply the plan without a second model run. Fast mode skips dead-link checks, the extra taxonomy-planning request, and model waiting; unmatched bookmarks go to manual review so slow model queues do not block preview, and Fast automatic organize can run locally without an API key. Settings use inline confirmations and validation feedback, successful API tests save the connection, and slow providers such as DeepSeek and DeepSeek-compatible endpoints in Complete mode skip the separate taxonomy-planning request, re-split large batches before each request, cap runtime batches at 15 bookmarks, cap each model request at 5 bookmarks, and run up to three mini requests at a time. If the model still times out, the run stops waiting for the model and finishes with local fallback instead of failing the whole flow.
