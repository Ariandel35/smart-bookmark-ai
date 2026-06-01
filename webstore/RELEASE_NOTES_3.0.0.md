# Marko 3.0.0 Release Notes

## 中文

Marko 3.0.0 重点打磨界面流程和设置路径，让扩展更简洁、更直接。

- 弹窗改为“预览整理 -> 应用方案”的主流程，避免默认按钮含义不清
- 应用已生成的预览方案时会复用保存的方案，本地重建，不会再次请求模型
- 如果应用预览时遇到可恢复失败，弹窗会保留应用入口，修复后可直接重试保存方案
- 配置不完整时，弹窗主按钮会直接进入设置页
- DeepSeek 和 DeepSeek 兼容接口会跳过单独目录规划请求，在请求前再次拆分大批量，运行批次最多 9 条、单个模型请求最多 3 条，并最多 3 个小请求并发处理；如果 6 秒无首包或 14 秒未完整返回，本轮会保留并缓存已完成的小请求分类，只把未返回的书签交给本地兜底和待手动分类，状态中会明确显示已保留和待处理数量
- 完整模式也会先应用确定性的内置域名规则，常见网站不再占用模型分类请求
- 新增快速/平衡/完整速度模式：快速模式跳过失效链接检测、额外目录规划请求和模型等待；平衡模式跳过失效链接检测但保留 AI 分类；完整模式保留链接检查和 AI 分类，并按服务商速度决定是否额外规划目录
- 快速模式会直接本地完成预览；规则和缓存无法确定的书签会进入待手动分类，不再因为慢模型排队而卡住
- 预览会先检查本地规则和缓存覆盖情况；快速模式不要求模型接口授权，平衡/完整模式只有未缓存书签需要 AI 分类时才要求 API Key 或模型接口授权
- 快速模式现在也不会因为 Base URL 或模型名称为空而阻止预览或保存设置，因为本地路径不调用模型
- 设置页连接区会随速度模式说明是否需要模型字段或网站权限，快速模式不再看起来像必须先配置 API
- 设置页连接字段现在也会把当前速度模式要求提供给读屏等辅助技术，同时保留页面内校验提示
- 设置页隐私按钮会优先新建标签页，失败时回退到窗口打开；如果两种方式都被浏览器拦截，会显示页面内错误
- 弹窗设置提示不再把快速模式说成必须先接入 API，只有确实需要模型分类时才提示模型凭据
- 弹窗设置入口在新建标签页和扩展选项页回退都失败时，会显示页面内错误，不再表现为按钮无响应
- 弹窗在要求完成 AI 访问配置前，会说明有多少条未缓存书签确实需要模型分类
- 弹窗操作失败后会保留页面内错误提示，不会在按钮恢复可点时立刻清空失败原因
- 弹窗状态刷新失败时会显示页面内错误并继续重试，恢复后自动清除提示，避免用户一直看到过期状态却没有提示
- 弹窗操作已经成功但后续状态刷新失败时，会保留“状态刷新失败”提示，不再把已完成操作误报成失败或直接清空提示
- 弹窗文件夹摘要读取失败时会显示详情区提示，不再静默显示空白结果区
- 白名单网站目录读取失败时会显示独立错误提示，不再误显示成没有可选网站
- 弹窗顶部操作区和状态徽标会在窄宽度内自动换行，避免中文或较长状态挤压重叠
- 完整模式失效链接检测现在最多并发 8 条，单条超过 6 秒会留给人工确认，避免慢网站拖住整批预览
- 已保存预览的校验现在包含白名单保留书签，书签变化后不会把旧白名单内容重新应用回去
- 备份恢复现在会保留现有备份文件夹，只替换普通书签内容，和恢复前快照范围保持一致
- 弹窗切换速度模式时会先合并服务商默认值，旧版残缺配置不会继续保留缺失连接字段
- 预览启动会复用弹窗预检的本地覆盖结果，即使慢模型运行批量被压低，也不会重复扫描同一批书签
- 快速自动整理现在可以不填 API Key 本地运行；平衡自动整理需要模型凭据，完整自动整理还要求网站访问权限
- API 检测成功后自动保存当前连接配置
- API 检测成功但自动整理权限未授权时，会明确显示该权限问题
- 设置页会在保存前提示 DeepSeek 兼容慢模型批大小将被压低，并实时说明自动整理当前需要的权限
- 设置页授权访问成功后会明确显示已授权状态，不再停留在等待授权的文案
- 设置页现在会把授权结果和后续权限状态刷新失败分开处理，已授权不会因为刷新异常被误报成授权失败
- 弹窗应用方案、备份恢复/删除和设置校验都改成页面内确认与状态提示，不再弹出浏览器原生对话框
- 预览阶段的未处理项保持只读，不会在点击“应用方案”前显示保留/删除操作
- 未处理项保留/删除期间会锁定整组操作按钮，避免重复点击造成并发请求
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

3.0.0 优化了核心使用路径：先预览，再应用方案。应用预览不会再次跑模型；快速模式默认更快且权限更少，会跳过失效链接检测、单独目录规划和模型等待，未命中本地规则的书签进入待手动分类；平衡模式保留 AI 分类但跳过网站检测；快速自动整理也可不填 API Key 本地运行；设置页使用内联确认和校验提示，API 检测成功后会保存连接配置，完整模式下也会先用内置域名规则减少模型请求。DeepSeek 和 DeepSeek 兼容接口会跳过单独目录规划请求，在请求前再次拆分大批量，运行批次最多 9 条、单请求最多 3 条，并最多 3 个小请求并发处理；如果模型仍然超时，本轮会保留已返回的小请求结果，只把未返回的书签交给本地兜底继续完成。

## English

Marko 3.0.0 focuses on a simpler, more polished workflow.

- The popup now uses a clear `Preview` -> `Apply Plan` primary flow
- The popup now includes a Fast/Balanced/Complete mode switch, so users can change speed or quality before preview without opening settings
- Applying a ready preview reuses the saved plan and rebuilds locally without another model request
- If applying a saved preview hits a recoverable failure, the popup keeps the apply path available so the saved plan can be retried
- Backup failures before applying a saved preview also keep the saved preview retry path available
- Apply Plan retry is shown only for preview-apply failures, not unrelated error states that merely still have a saved preview
- Incomplete setup routes directly from the popup to settings
- Complete mode also applies deterministic built-in domain rules before AI classification, so common sites no longer spend model-request time
- Slow providers such as DeepSeek and DeepSeek-compatible endpoints skip the separate taxonomy-planning request, re-split large batches before each request, cap runtime batches at 9 bookmarks, cap each model request at 3 bookmarks, and run up to three mini requests at a time; if there is no first response in 6 seconds or no full response in 14 seconds, Marko keeps and caches any completed mini-request classifications and sends only unfinished bookmarks to local fallback and manual review
- Added Fast, Balanced, and Complete speed modes: Fast skips dead-link checks, the extra taxonomy-planning request, and model waiting; Balanced skips dead-link checks but keeps AI classification; Complete keeps link checks and AI classification with provider-aware planning
- Fast mode now finishes previews locally; bookmarks that custom rules, cache, and built-in domain rules cannot classify go to manual review instead of blocking on a slow model queue
- Preview checks local rule/cache coverage first; Fast mode does not ask for model endpoint access, and Balanced/Complete ask only when uncached bookmarks need AI classification
- Fast mode no longer blocks preview or settings save when Base URL or model name are blank because the local path does not call the model
- Settings connection now explains which modes need model fields or website access, so Fast mode no longer looks like mandatory API setup
- Settings connection fields now expose the selected mode requirement hint to assistive technologies while preserving inline validation messages
- Settings Privacy now falls back from tab creation to window opening and shows an inline error if the browser blocks both paths
- Popup setup copy no longer implies Fast mode needs API credentials; model credentials are shown only when classification actually needs the model
- Popup Settings shortcuts now show an inline error if both tab creation and the options-page fallback fail
- Popup setup errors now show how many uncached bookmarks require model classification before asking users to finish AI access setup
- Popup action failures now keep their inline error visible after buttons unlock instead of clearing the failure reason during cleanup
- Popup action error responses now keep their specific failure message even if the follow-up popup refresh also fails
- Popup action successes now preserve refresh-failure feedback instead of clearing it or misreporting the completed action as failed
- Popup and settings startup controls now stay disabled until saved state is loaded or a recoverable load failure is shown, avoiding early mis-clicks on stale default UI
- Long settings status and hint text now wraps safely on narrow screens, and disabled primary buttons use a muted disabled style instead of looking actionable
- Popup state refresh failures now show an inline error and keep retrying, then clear the warning after refresh recovers so users are not left with silently stale status
- Popup folder-summary load failures now render an inline detail message instead of silently showing an empty result area
- Whitelist website catalog load failures now show a distinct inline error instead of looking like an empty bookmark-site list
- Popup header actions and the phase badge now wrap within their reserved width to avoid cramped or overlapping text in narrow localized popups
- Complete-mode dead-link checks now scan up to eight links in parallel and leave links that take longer than six seconds for review, so slow sites do not hold up the whole preview
- Complete mode now skips the separate taxonomy-planning model request when local rules, cache, and built-in rules leave fewer than 25 AI candidates, avoiding an extra model wait on small previews
- Saved preview validation now includes whitelist-preserved bookmarks so Apply Plan cannot restore stale whitelisted content after bookmarks change
- Backup restore now preserves existing backup folders while replacing normal bookmark content, matching the pre-restore snapshot scope
- Popup speed-mode changes now save against merged provider defaults, so legacy partial configs do not keep stale missing connection fields
- Preview startup reuses the popup preflight coverage result even after slow-model runtime batch caps, avoiding a duplicate bookmark scan before the run starts
- Fast automatic organize can now run locally without an API key; Balanced automatic organize requires model credentials, and Complete automatic organize also requires website access
- Successful API tests now save the verified connection settings
- If an API test succeeds but auto organize access is not granted, the settings page reports that permission issue inline
- Settings warn before capping slow-model batch sizes and explain the selected auto-organize mode's permission impact inline
- After access approval succeeds, settings now show an explicit granted status instead of leaving the waiting message in place
- Settings access requests now separate the permission decision from follow-up status refresh failures, so a granted request is still reported as granted
- Settings save and Test & Save keep API or automation permission-denied feedback visible even if the follow-up access-status refresh fails
- Popup apply, backup restore/delete, and settings validation now use inline confirmations and status messages instead of browser dialogs
- Unprocessed items stay read-only until an organize/apply run completes, so preview and error states cannot mutate bookmarks
- Unprocessed item keep/delete actions lock the whole action group while one item is being handled
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

3.0.0 streamlines the core workflow: preview first, switch Fast/Balanced/Complete directly in the popup when needed, then apply the plan without a second model run. Fast mode skips dead-link checks, the extra taxonomy-planning request, and model waiting; unmatched bookmarks go to manual review so slow model queues do not block preview. Balanced keeps AI classification without website scans, and Fast automatic organize can run locally without an API key. Complete mode now applies built-in domain rules before AI to reduce model work and skips the separate taxonomy-planning request on small AI candidate sets. Settings use inline confirmations and validation feedback, successful API tests save the connection, and slow providers such as DeepSeek and DeepSeek-compatible endpoints in Complete mode skip the separate taxonomy-planning request, re-split large batches before each request, cap runtime batches at 9 bookmarks, cap each model request at 3 bookmarks, and run up to three mini requests at a time. If the model still times out, Marko keeps any completed mini-request classifications, shows how many were preserved, and sends only unfinished bookmarks to local fallback instead of failing the whole flow.
