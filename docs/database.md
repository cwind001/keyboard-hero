# 本地数据库设计

更新日期：2026-10-25。SQLite schema 版本 2，随机难度游戏规则版本 4（保留旧版本历史）。

## 表与关系

| 表 | 关键字段与约束 | 作用 |
| --- | --- | --- |
| players | id；nickname 唯一、不区分 ASCII 大小写 | 本地玩家，无密码 |
| textbooks | name、edition、grade、volume、archived_at | 教材及归档状态 |
| word_lists | textbook_id 可空、name、description、archived_at | 单元或独立词表 |
| words | text 全局唯一、小写英文 | 英文单词规范化 |
| word_list_items | (list_id, word_id) 联合主键、meaning、position | 词表与单词多对多；释义随具体词表保存 |
| game_sessions | player_id、mode、status、outcome、时间、原始计数、配置与指纹 | 对局与成绩 |
| session_word_lists | session_id、list_id、name_snapshot、textbook_snapshot | 当时选用的教材／词表名称快照 |
| session_words | (session_id, text) 联合主键、meaning | 当时实际可用词汇快照 |

外键在每个连接中启用。写请求使用事务；词表更新整体替换关联条目，校验失败回滚，不留下半张词表。仅归档教材／词表，不物理删除历史引用。

词条英文最长 40 字符，允许 A–Z 字母、单词间空格及连字符（例如 hard-working、ice cream）；中文释义最多 120 字，可留空作为草稿。同一英文在多张所选词表中的非空释义去重合并。中文提示模式要求合并后的每个词都有释义。

## 对局状态

```text
running → completed（通关 / 失败 / 练习完成）
        → interrupted（切换模式 / 离开页面 / 服务重启）
```

终态不可改写，重复提交幂等。中断成绩可用于查看历史，不参与个人纪录及排行榜。服务重启会把遗留 running 记录标记为 interrupted；页面关闭上报是尽力而为，未成功上报的记录将在下次服务启动时处理。

原始成绩字段为 duration_ms、score、kills、max_combo、total_keys、correct_keys。准确率及速度查询时计算，练习速度为每分钟正确字母数。存储时间统一为 UTC，浏览器按用户本地时间展示。

当前模式切换保存到切换时的计数；关闭页面通过 Beacon 尝试保存。浏览器保留失败上报队列，并允许重试。服务重启已终结的中断对局不再覆盖成已结算。

## 内容指纹与排名

对去重后的 `text + meaning` 列表按英文排序、规范化 JSON 后计算 SHA-256。教材／词表改名不影响指纹；词汇或释义变化影响指纹。

`context_key = mode | vocabulary_source | fingerprint | hint_mode | ruleset_version | hint_config_hash`

`game_sessions.hint_config` 在规则 4 保存 `{"difficulty":"easy","weights":{"full":92,"edges":6,"hidden":2}}`，比例由服务端根据难度生成；规范化 JSON 的 SHA-256 作为 `hint_config_hash`，hint_mode 为 mixed。三个难度分别排名，旧规则成绩保留原分组。浏览器使用服务端返回的配置。旧客户端的按怪物配置仍兼容规则 3。

练习范围被快照为字母集合，天然形成不同指纹；提示方式统一 full。内置词库与自定义词库始终分别排名。记录界面显示指纹短前缀，以区分同名词表的不同内容。

个人最高分及排行榜直接聚合已结算对局，不维护冗余最高分表。按玩家／时间、条件／成绩建索引。准确率和速度独立取最大值，不暗示两者发生在同一局。

## 接口

| 方法与路径 | 用途 |
| --- | --- |
| GET /api/catalog | 可用教材、词表摘要、玩家 |
| POST /api/players | 按昵称查找或创建玩家 |
| POST /api/textbooks | 创建／更新教材，更新时提供 id |
| POST /api/lists | 创建／更新词表与完整 entries，更新时提供 id |
| GET /api/lists/:id | 读取词表及词条 |
| POST /api/textbooks/:id/archive | 归档教材（旗下词表不再用于新对局） |
| POST /api/lists/:id/archive | 归档词表 |
| POST /api/sessions | 创建对局与快照，返回词汇、对局编号、排名条件 |
| POST /api/sessions/:id/finish | 幂等结算／中断 |
| GET /api/stats?player_id=… | 最近 20 局、分组个人纪录 |
| GET /api/leaderboard?context_key=… | 同条件前 20 名玩家 |

创建对局参数：player_id、mode（standard/practice）、source（builtin/custom）、difficulty（easy/medium/hard；新客户端必传，旧客户端 hint_config 仍兼容）、list_ids、practice_range。后端校验来源、词表归档状态、词条中文完整性，再在同一事务中生成快照。游戏以响应中的快照开局。

HTTP 服务仅绑定 127.0.0.1，限制 Host 与写入 Origin，接受 JSON 写请求，仅提供白名单静态文件，不提供数据库文件下载。它是单机工具，不应直接作为公网服务部署。

## 当前边界

- schema 通过 PRAGMA user_version 标记。版本 1 → 2 自动新增 hint_config 列；原有对局、分数、规则版本和排名条件保持不变。旧记录的提示配置为 `{}`，仍按其原有 hint_mode 展示。
- 游戏规则版本 3 将通关判定提前到 4:30 出怪结束且清场完成，旧规则成绩单独保留。
- 无账号鉴权及服务端战斗校验，同机用户可操作本地数据。
- 不记录逐字输入事件，不支持中断续局。
- 不自动导入旧 localStorage 最高分，旧纪录缺少玩家及词库上下文。
- 内置词条中文是基础释义，教材词表由用户根据教学内容维护。

- 游戏规则版本 4 使用与怪物类型无关的逐词随机提示，难度配置沿用 hint_config JSON 存储，无需修改表结构。
