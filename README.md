# 🏡 家庭仪表盘 · Family Dashboard

A colorful, kid-friendly family dashboard. The home page is an **ontology-driven AI food assistant**: it recommends
seasonal ingredients / fruits / vegetables and simple recipes that suit the family's health profiles, and an AI chat
dynamically invokes Agent capabilities to update the home page. Travel, tasks, shopping and deals modules are kept.

## 🥗 AI 饮食首页（Ontology + AI Agents）

- **当季优先推荐**：结合当前月份/季节与家人健康档案，推荐食材、水果、蔬菜及简单食谱，自动避开过敏原、标注慎食人群。
- **对话式健康档案**：随时在对话里补充家人信息，属性不限（如“奶奶72岁，血糖偏高，对花生过敏，最近睡眠不好，血压：150/95”）。
  未知的健康状况/过敏原会作为新概念自动扩展进本体。
- **AI Key 可配置**（`/settings`）：支持 OpenAI 兼容接口（OpenAI、DeepSeek、通义千问、Kimi 或自定义）。
  未配置时使用本地规则路由；配置后由大模型通过 function calling 选择能力，失败自动回退本地模式。
  Key 默认只保存在 sessionStorage（关闭浏览器即清除），用户勾选“记住 Key”才会写入 localStorage；仅允许 https（本机调试可用 http://localhost）；正式上线建议走后端代理。
- **Agent 能力可扩展**（`/agents`）：内置健康档案、营养推荐、食材数据采集、超市比价、其他 App 打折、模拟下单、物流查询等能力；
  可在对话中管理能力，例如：
  - `你能做什么`
  - `添加能力 名称:社区团购查询 关键词:团购,拼团 回复:今晚8点社区团购截单`（模拟数据型）
  - `添加能力 名称:营养师点评 关键词:点评 提示词:请点评{input}，家庭情况：{family} Agent:营养师`（AI 型，会新建 Agent）
  - `禁用能力 社区团购查询` / `启用能力 …` / `删除能力 …`
- **意图驱动的动态首页**：每次能力调用都会生成/刷新首页卡片（推荐、食谱、比价、优惠、订单、物流……），对话中显示调用链路。

### 本体设计

| 层 | 内容 |
|----|------|
| Schema（`src/ontology/schema.js`） | 类：家庭成员、健康状况、过敏原、食材、季节、食谱、超市、价格报价、优惠活动、订单、物流单、Agent、能力；关系：`hasCondition`、`allergicTo`、`hasAttribute`（开放属性）、`benefits`、`cautionFor`、`containsAllergen`、`availableIn`、`usesIngredient`、`offerOf`、`soldAt`、`promotes`、`orderedFrom`、`orderContains`、`shipmentOf`、`providedBy` |
| 知识图谱（`src/ontology/graph.js`） | 按 Schema 校验的三元组存储；`base` 层来自本地模拟数据，`user` 层由对话产生并持久化到 localStorage |
| Agent（`src/agents/`） | `router.js` 本地意图路由，`profileExtractor.js` 档案抽取，`orchestrator.js` 规划与执行（本地或 LLM），`capabilities.js` 能力实现，`recommender.js` 基于图谱推理的推荐 |

> 健康饮食建议仅供参考，不能替代医生或营养师的专业意见。

## ✨ Modules

| Module | Description |
|--------|-------------|
| 🥗 **Food Home** (`/`) | Seasonal food & recipe recommendations, family health profiles, AI chat |
| 🧠 **Agent Center** (`/agents`) | Agents & capabilities (enable/disable/delete), ontology explorer |
| ⚙️ **AI Settings** (`/settings`) | Configure your own AI key / endpoint / model, reset demo data |
| 🏠 **Overview** (`/overview`) | Previous dashboard with summary cards, alerts, and activity feeds |
| ✈️ **Trips** | Trip list, travel budget, booking links, packing checklist, member assignments, kids' wishes |
| ✅ **Tasks** | Recurring household tasks (daily/weekly/monthly) with kid reward points |
| 🛒 **Shopping** | Shared shopping list, low-stock alerts, favourite items |
| 🏷️ **Deals** | Promotion import from WeChat messages, auto-extraction, daily digest |
| 📤 **Agency Upload** | Travel agency upload page for promo text, last-minute seats, and image materials |
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
├── data/              # Local mock JSON data (members, trips, tasks, shopping, deals)
│   └── food/          # Ingredients, recipes, conditions, allergens, prices, app discounts, logistics, agents/capabilities
├── ontology/          # Ontology schema, knowledge graph, seeding, domain queries
├── agents/            # Intent router, profile extractor, orchestrator, capabilities, recommender, LLM client
├── utils/             # Utility functions (deal extractor, classifier)
├── components/
│   ├── home/          # AI food home: chat, family profiles, dynamic view cards
│   ├── agents/        # Agent capability center + ontology explorer
│   ├── settings/      # AI key settings
│   ├── layout/        # App shell: sidebar navigation
│   ├── dashboard/     # Overview page with summary cards
│   ├── trips/         # Trip list, detail, packing checklist, wishes
│   ├── tasks/         # Recurring tasks, points leaderboard
│   ├── shopping/      # Shopping list, low-stock, favourites
│   ├── deals/         # Deal feed, daily digest, message import, agency uploads
│   └── auth/          # Login (WeChat QR placeholder)
├── App.jsx            # Router configuration
└── main.jsx           # Entry point
```

## 📋 Mock Data Files

- `src/data/members.json` — Family members (parents + kids with points)
- `src/data/trips.json` — Trip plans with checklists, assignments, wishes
- `src/data/tasks.json` — Recurring tasks with points
- `src/data/shopping.json` — Shopping items with stock levels
- `src/data/deals.json` — Promotion deals with category & price
- `src/data/food/ingredients.json` — Ingredients with seasonal months, nutrients, benefit/caution conditions, allergens
- `src/data/food/recipes.json` — Simple recipes linked to ingredients
- `src/data/food/conditions.json` / `allergens.json` — Health condition & allergen vocabularies (with synonyms)
- `src/data/food/supermarketPrices.json` / `appDiscounts.json` / `logistics.json` — Simulated stores, prices, app deals, deliveries
- `src/data/food/agents.json` — Built-in agents and capability definitions (keywords + JSON-schema params)

## 🔮 Future Roadmap

- Real WeChat QR OAuth login (swap `Login.jsx` → `WeChatQRSection`)
- Automatic WeChat group message ingestion
- AI-powered deal extraction & price-drop alerts
- Backend / database integration
- Full family member role permissions
