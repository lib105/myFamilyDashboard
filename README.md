# 🏡 家庭仪表盘 · Family Dashboard

A colorful, kid-friendly family dashboard. The **family home page** is an ontology-driven AI assistant: food, health,
task and travel Agents work together, and an AI chat dynamically invokes Agent capabilities to update the home page.
Every Agent can be configured (Agent.md / Skill.md / Context.md, tools, knowledge files & URLs, starter prompts).

## 🏡 AI 家庭首页（Ontology + AI Agents）

- **当季优先推荐**：结合当前月份/季节与家人健康档案，推荐食材、水果、蔬菜及简单食谱，自动避开过敏原、标注慎食人群。
- **对话式健康档案**：随时在对话里补充家人信息，属性不限（如“奶奶72岁，血糖偏高，对花生过敏，最近睡眠不好，血压：150/95”）。
  未知的健康状况/过敏原会作为新概念自动扩展进本体。
- **AI Key 可配置**（`/settings`）：支持 OpenAI 兼容接口（OpenAI、DeepSeek、通义千问、Kimi 或自定义）。
  未配置时使用本地规则路由；配置后由大模型通过 function calling 选择能力，失败自动回退本地模式。
  Key 默认只保存在 sessionStorage（关闭浏览器即清除），用户勾选“记住 Key”才会写入 localStorage；仅允许 https（本机调试可用 http://localhost）；正式上线建议走后端代理。
- **旅行 / 健康 / 任务 Agent**：
  - ✈️ 旅行 Agent：`我们有哪些旅行计划`、`大阪行前清单还差什么`（可勾选清单）、`三亚亲子游有什么建议`
  - 💗 健康 Agent：`全家健康状况怎么样`、`今天有哪些健康提醒`、`提醒爸爸每晚9点测血压`
  - ✅ 任务 Agent：`今天有哪些家庭任务`、`添加任务 给小明 整理书桌 10积分`、`浇花完成了`（自动累计积分）
- **Agent 配置**（`/agents` → ⚙️ 配置，参考 Microsoft Copilot Agent 配置项）：
  - 基本信息：名称、图标、描述；可「＋ 新建 Agent」，用户创建的 Agent 可删除，内置 Agent 可「恢复默认」
  - `Agent.md`（指令）、`Skill.md`（技能）、`Context.md`（上下文）：Markdown 编辑，支持导入/导出 .md 文件
  - 工具：启用/禁用该 Agent 的能力，新增「固定回复」或「AI 提示词」型工具（即时生效）
  - 知识：上传文件（.md/.txt/.json/.csv/.html 等文本格式会被解析，PDF/Word/图片仅记录文件信息）、添加网址
    （浏览器可抓取时解析正文，受跨域限制时作为参考网址提供给 AI），可选「仅基于指定知识回答」
  - 开场提示：显示在家庭首页对话建议中；右侧「🧪 试一试」可用未保存的配置测试，并预览系统提示词
  - 配置用于 AI 路由提示词、各 Agent 的咨询工具及自定义 AI 工具；未配置 AI Key 时，咨询工具会在 Context.md 与知识中做本地检索
- **Agent 能力可扩展**（`/agents`）：内置健康档案、营养推荐、食材数据采集、超市比价、其他 App 打折、模拟下单、物流查询、旅行、健康、任务等能力；
  可在对话中管理能力，例如：
  - `你能做什么`
  - `添加能力 名称:社区团购查询 关键词:团购,拼团 回复:今晚8点社区团购截单`（模拟数据型）
  - `添加能力 名称:营养师点评 关键词:点评 提示词:请点评{input}，家庭情况：{family} Agent:营养师`（AI 型，会新建 Agent）
  - `禁用能力 社区团购查询` / `启用能力 …` / `删除能力 …`
- **意图驱动的动态首页**：每次能力调用都会生成/刷新首页卡片（推荐、食谱、比价、优惠、订单、物流、旅行、任务、健康提醒……），对话中显示调用链路。
- **首页布局**：顶部为紧凑天气栏（[Open-Meteo](https://open-meteo.com/) 免 Key 接口，可切换城市或使用当前位置，失败时只显示日期与季节）；
  左侧为固定大小的家庭档案（内部滚动）；页面中间「🎯 当前回答」显示当前问题的完整回答及本次生成的卡片，其他卡片排在下方；
  右侧对话框只显示回答摘要（点击「完整结果见页面中间」可回看），输入框始终固定在可视区域内（窄屏时固定在屏幕底部）；
  遇到无法回答的问题会在屏幕中间弹出提示层，并给出可尝试的问法。

### 本体设计

| 层 | 内容 |
|----|------|
| Schema（`src/ontology/schema.js`） | 类：家庭成员、健康状况、过敏原、食材、季节、食谱、超市、价格报价、优惠活动、订单、物流单、旅行计划、家庭任务、健康提醒、Agent、能力；关系：`hasCondition`、`allergicTo`、`hasAttribute`（开放属性）、`benefits`、`cautionFor`、`containsAllergen`、`availableIn`、`usesIngredient`、`offerOf`、`soldAt`、`promotes`、`orderedFrom`、`orderContains`、`shipmentOf`、`providedBy` |
| 知识图谱（`src/ontology/graph.js`） | 按 Schema 校验的三元组存储；`base` 层来自本地模拟数据，`user` 层由对话产生并持久化到 localStorage |
| Agent（`src/agents/`） | `router.js` 本地意图路由，`profileExtractor.js` 档案抽取，`orchestrator.js` 规划与执行（本地或 LLM），`capabilities.js` 能力实现，`familyAgents.js` 旅行/健康/任务能力，`agentConfig.js` Agent 配置与知识库，`recommender.js` 基于图谱推理的推荐 |

> 健康饮食建议仅供参考，不能替代医生或营养师的专业意见。

## ✨ Modules

| Module | Description |
|--------|-------------|
| 🏡 **Family Home** (`/`) | Food & recipe recommendations, health profiles, tasks, health reminders, trips, AI chat |
| 🧠 **Agent Center** (`/agents`) | Agents & capabilities, per-agent configuration (Agent.md / Skill.md / Context.md, tools, knowledge files & URLs, starter prompts), ontology explorer |
| ⚙️ **AI Settings** (`/settings`) | Configure your own AI key / endpoint / model, reset demo data |
| 👤 **Login** | WeChat QR login placeholder (swappable for real OAuth) |

## 🚀 Getting Started

```bash
npm install
npm run dev       # development server
npm run build     # production build
npm run preview   # preview production build
```

## 🗂️ Project Structure

```
src/
├── data/              # Local mock JSON data (members, trips, tasks, health reminders)
│   └── food/          # Ingredients, recipes, conditions, allergens, prices, app discounts, logistics, agents/capabilities
├── ontology/          # Ontology schema, knowledge graph, seeding, domain queries
├── agents/            # Intent router, profile extractor, orchestrator, capabilities, recommender, LLM client
├── components/
│   ├── home/          # AI family home: chat, family profiles, dynamic view cards
│   ├── agents/        # Agent center, agent configuration editor, ontology explorer
│   ├── settings/      # AI key settings
│   ├── layout/        # App shell: sidebar navigation
│   └── auth/          # Login (WeChat QR placeholder)
├── App.jsx            # Router configuration
└── main.jsx           # Entry point
```

## 📋 Mock Data Files

- `src/data/members.json` — Family members (parents + kids with points)
- `src/data/trips.json` — Trip plans with checklists, assignments, wishes (travel agent)
- `src/data/tasks.json` — Recurring tasks with points (task agent)
- `src/data/healthReminders.json` — Medication / check-up / vaccine reminders (health agent)
- `src/data/food/ingredients.json` — Ingredients with seasonal months, nutrients, benefit/caution conditions, allergens
- `src/data/food/recipes.json` — Simple recipes linked to ingredients
- `src/data/food/conditions.json` / `allergens.json` — Health condition & allergen vocabularies (with synonyms)
- `src/data/food/supermarketPrices.json` / `appDiscounts.json` / `logistics.json` — Simulated stores, prices, app deals, deliveries
- `src/data/food/agents.json` — Built-in agents (incl. default Agent.md / Skill.md / Context.md / starter prompts) and capability definitions (keywords + JSON-schema params)

## 🔮 Future Roadmap

- Real WeChat QR OAuth login (swap `Login.jsx` → `WeChatQRSection`)
- Server-side parsing of PDF / Word knowledge files and crawling of knowledge URLs
- Backend / database integration
- Full family member role permissions
