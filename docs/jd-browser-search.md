# 采购 Agent：京东真实商品、价格和优惠搜索

## 新版流程

当前为 [先确认采购需求，再仅搜索京东商品与优惠](shopping-comparison.md)。淘宝和天猫搜索已取消。普通商品请求会先追问尚缺的类型、品牌、规格和预算；可选择“不限”或明确“先直接搜”。历史 product_search 卡片仍可查看。

## 使用

在本机网页（当前 `http://127.0.0.1:5173/`）的对话框中输入：

- `在京东搜索牛奶，看看价格和优惠`
- `帮爸爸在京东查血压计的价格`
- `京东纸尿裤有什么打折信息`
- `在 JD.com 搜索 纯牛奶250ml24盒 价格`

新版京东搜索最多采集 10 项商品，再核对需求和店铺证据；显示标题/规格文字、商品链接、页面展示价、价格条件、可见优惠/标签、店铺与采集时间。
不会自动领取优惠券、添加购物车或下单。保留原有模拟超市比价/订单功能，但京东查询不回退为模拟报价。

## 本体扩展决策

采用 Extend 模式，复用 `BrowserSite` 和 `BrowserTaskRun`，不为一次搜索额外创建通用电商商品主数据体系。

需要回答的问题：

1. 采购 Agent 被授权搜索哪个站点？——`search_products_with_browser -usesBrowserSite→ site_jd`。
2. 哪个 Agent 在何时搜索了什么？——`BrowserTaskRun(kind=product_search)`，通过 `executedByAgent`、`targetsSite` 保留执行来源和站点关系。
3. 商品价与优惠条件来自哪里？——每项结果保留公开页面 SKU 对应的商品 URL，整个快照记录 `observedAt`。
4. 无价格、无优惠、登录/验证阻塞时是否会编造？——缺失字段显示“未采集到”；阻塞记录 failed 并提示人工处理，不生成结算价。

`PriceOffer -offerOf→ Ingredient` 是现有模拟食材报价模型，不适合直接承载任意京东商品。
本次将外部商品结果作为执行事件上的观察快照保存，不覆盖模拟 PriceOffer/Promotion，也不把外部展示价格声明为系统保证的事实。
若未来需要跨店同款比较、价格历史、SKU 入库或可执行购买，再独立设计 Product / SKU / OfferObservation 及其关系。

## 调用链与代码

```text
聊天 / AI 工具调用
 → search_products_with_browser（采购 Agent，execution=browser）
 → POST /api/ego-browser/search-products
 → 服务端固定京东搜索 URL、独立操作白名单、共享浏览器并发限制
 → ego-browser 固定只读脚本
 → JD 搜索卡片 DOM
 → BrowserTaskRun 快照
 → product_search 首页卡片
```

- 站点配置：`src/data/browserSites.json`，`site_jd`。
- 能力及路由：`src/data/food/agents.json`、`src/agents/router.js`、`src/agents/orchestrator.js`。
- 服务端提取：`server/jdSearchPage.js`；支持本机观察到的 `[data-sku]` 卡片与经典搜索页选择器。
- 结果约束：`src/agents/productResults.js`；仅接受 `https://item.jd.com/<数字SKU>.html`，SKU 不转为 JS Number。
- 执行记录：`src/agents/shoppingBrowserAgent.js`；只修改 BrowserTaskRun，不创建 Order。
- 展示：`src/components/home/ProductSearchView.jsx`。

服务器构造 `https://search.jd.com/Search?keyword=<编码关键词>&enc=utf-8`，不接受客户端 URL 或脚本。
视频接口不允许京东和淘宝；商品接口仅允许京东搜索站点。二者共享认证、请求大小、超时和单工作器并发限制。
站点配置为静态 JSON 导入，Vite 开发环境可跟踪白名单变化；生产环境更新代码后仍需重启服务。

## 价格与打折的含义

- `priceText` 是采集时页面展示的主价格原文，不是无条件最终结算价。
- `priceNote` 单独保留 `PLUS到手价`、`新人价`、`已补…元` 等条件，不把补贴金额误当作售价。
- `referencePriceText` 标为“页面对照价”，不声称是历史原价。
- `promotions` 保留页面可见的券、满减等标签原文，不相减、不叠加、不推算折扣率。
- 不采集被页面容器裁剪隐藏的优惠；缺少优惠文字不等于“没有优惠”。
- 商品排序采用网站搜索顺序，保留广告标记，不声明全网最低价，也不将不同规格直接按展示价排名。
- 规格、地区、会员身份、领券门槛和活动时效均可能改变实际结算价，购买前以京东页面确认为准。
- 只保存商品结果，不采集京东账号、购物车内容或具体收货地址。

## 验证与排错

浏览器主机、认证代理及启动方式沿用 [ego-lite 部署说明](ego-browser-server.md)。
生产接口样例（密钥来自服务端环境，不要放进网页）：

```sh
curl -sS http://127.0.0.1:3001/api/ego-browser/search-products \
  -H "X-Ego-Bridge-Token: $EGO_BRIDGE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"siteId":"site_jd","query":"牛奶"}'
```

京东需要登录/安全验证时返回 `BROWSER_NEEDS_ATTENTION`，在对应 ego-lite 任务空间中手动完成后再重新搜索。不会自动填写账号密码或绕过验证。
本机已通过网页聊天 → 服务端浏览器 → 京东商品快照 → 结果卡片的真实端到端验证。价格仅代表当时该浏览器会话所见，并非稳定测试断言。

自动化测试使用明确标注的测试商品样例，覆盖 URL 白名单、优惠条件保留、隐藏标签过滤、AI/本地路由、无购买副作用、失败与跨操作并发等；不依赖线上商品价格保持不变。
