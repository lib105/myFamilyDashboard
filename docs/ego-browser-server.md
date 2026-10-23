# 服务端 ego-lite：部署、验证与故障排查

## Skill 不等于应用工具

安装 `ego-browser` Skill 只是给编码助手提供操作文档，不会自动向网页里的模型注册工具。
本项目的调用链是：

```text
聊天输入 / LLM function call
  → search_video_with_browser（Capability）
  → POST /api/ego-browser/search-video（视频）或 /api/ego-browser/search-products（京东商品）
  → Node 浏览器桥接服务
  → ego-browser nodejs -e <服务器固定脚本>
  → 同一服务账号下实际运行的 ego-lite 浏览器
  → 已提取的视频详情 URL
```

**Vite 的 configureServer 不会打包进 dist。** 只部署 `dist/` 到 Cloudflare Pages、Nginx 静态目录，无法运行服务器本地的 CLI。
Cloudflare Worker 也不能直接执行另一台机器的 `ego-browser` 进程。必须在能运行 ego-lite 的主机上提供桥接 API，再通过已认证的同源代理访问。

## 1. 在浏览器主机确认运行环境

使用实际运行 Node 服务的操作系统账号测试（不是只在 SSH 管理员账号下测试）：

```sh
command -v node
command -v ego-browser
ego-browser skill
ego-browser nodejs -e 'console.log("ego-browser ready")' < /dev/null
```

- 安装 Skill 目录不代表已安装 ego-lite 应用/CLI。
- 必须有实际可运行的 ego-lite 应用，已启动并完成首次初始化；CLI 与浏览器使用同一账号的会话。
- systemd/PM2/容器可能没有用户终端里的 PATH，也可能访问不到桌面浏览器会话。
- 如果是无桌面的 Linux/容器，先确认该系统受所安装 ego-lite 版本支持。当前 Skill 的安装说明主要覆盖 macOS/Windows；这里不假设它能在任意 Linux headless 环境运行。
- 登录、验证码、权限提示需要人处理；不绕过或自动点击这些安全检查。

## 2. 本地开发

```sh
npm install
npm run dev
curl -sS http://127.0.0.1:5173/api/ego-browser/health
```

成功的健康检查为 `{"bridge":"ok","runtime":"ready"}`。
它证明 CLI 运行时可调用，不代表任意目标网站可访问、已登录或能提取视频。
开发与 `vite preview` 复用同一桥接处理器。仅供受信任的本地调试，不要将未认证的 Vite 服务开放到公网。

## 3. 生产部署（独立 Node 服务）

在项目根目录：

```sh
npm ci
npm run build

# 用 command -v ego-browser 的真实结果，不要照抄本机路径。
export EGO_BROWSER_BIN=/absolute/path/to/ego-browser
# 使用独立的随机长密钥，通过部署环境注入，不要提交到 Git，也不要加 VITE_ 前缀。
export EGO_BRIDGE_TOKEN='<server-only-random-secret>'
export EGO_BRIDGE_PORT=3001
npm run start:browser
```

Node 只监听 `127.0.0.1:3001`。生产模式没有 `EGO_BRIDGE_TOKEN` 会拒绝启动。
Nginx 提供 `dist/`，同源 `/api/ego-browser/` 代理到 Node。示意配置（需替换证书、路径和密钥）：

```nginx
server {
    listen 443 ssl;
    server_name family.example.org;
    # 按现有部署配置 ssl_certificate / ssl_certificate_key。
    root /srv/myFamilyDashboard/dist;

    # 本项目的微信登录仍为演示占位，不是有效的身份验证。
    # 必须用真实登录网关、Access 或至少 Basic Auth 保护站点和 API。
    auth_basic "Family dashboard";
    auth_basic_user_file /etc/nginx/family-dashboard.htpasswd;

    location /api/ego-browser/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $http_host;
        # 该值必须与 Node 的 EGO_BRIDGE_TOKEN 相同，由部署系统生成配置。
        proxy_set_header X-Ego-Bridge-Token "<server-only-random-secret>";
        proxy_read_timeout 45s;
        client_max_body_size 4k;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

不要把桥接密钥写进 React、localStorage、URL 或前端环境变量。上面是反向代理信任凭据，**不是用户身份认证**；不能省略代理前的真实身份认证。
前端仍使用相对地址 `/api/ego-browser/...`。若前端留在 Cloudflare，需另外配置认证后的同源代理/隧道到浏览器主机；单独的 Pages build/deploy 不足以完成这一步。

## macOS：保持浏览器与服务运行在同一桌面用户下

推荐 **LaunchAgent（用户级）**，不要将这个 GUI 浏览器工作器部署为 root LaunchDaemon。

### A. 先在目标 Mac 手动验证

在实际使用 ego-lite 的 macOS 用户终端里：

```sh
open -a 'ego lite'
# 在界面完成初始化/登录，再执行：
command -v node
command -v ego-browser
ego-browser nodejs -e 'console.log("ego-browser ready")' < /dev/null
```

随后按上文先手动启动 Node 桥接服务，通过 health 和一次真实搜索确认能工作。
不能只在当前开发 Mac 验证后，就假设另一台 Mac 的 CLI、账号和浏览器会话也已配置。

### B. 手动验证通过后再配置自启动

模板：`deploy/macos/com.family-dashboard.ego-bridge.plist.example`。
模板本身不包含真实密钥；不要直接加载，先复制到仓库外：

```sh
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/FamilyDashboard"
cp deploy/macos/com.family-dashboard.ego-bridge.plist.example \
  "$HOME/Library/LaunchAgents/com.family-dashboard.ego-bridge.plist"
chmod 600 "$HOME/Library/LaunchAgents/com.family-dashboard.ego-bridge.plist"
```

编辑复制后的 plist，替换全部占位符：

| 占位符 | 如何获取 |
| --- | --- |
| `__NODE_ABSOLUTE_PATH__` | `command -v node` 的绝对路径 |
| `__NODE_BIN_DIRECTORY__` | 上一条路径去掉末尾 `/node` |
| `__EGO_BROWSER_ABSOLUTE_PATH__` | `command -v ego-browser` 的绝对路径 |
| `__PROJECT_ABSOLUTE_PATH__` | 在项目根目录执行 `pwd` |
| `__HOME_ABSOLUTE_PATH__` | `echo "$HOME"` |
| `__SERVER_ONLY_RANDOM_SECRET__` | 自行生成的长随机密钥，与认证代理中设置的桥接密钥一致 |

注意：launchd **不会加载 `.zshrc` 或 nvm 初始化脚本**，也不会替换 plist 字符串中的 `$HOME`、`~`。必须使用绝对路径。更换 nvm 的 Node 版本后要更新 plist。XML 中的 `&` 等特殊字符需转义。

生产密钥会保存在用户级 plist 中，因此保持权限 600，不要将这份真实配置提交到 Git。对更高安全要求可改用用户 Keychain/专门秘密管理系统，不应把密钥移入网页。

校验、加载（以该用户身份执行，**不要 sudo**）：

```sh
plutil -lint "$HOME/Library/LaunchAgents/com.family-dashboard.ego-bridge.plist"
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.family-dashboard.ego-bridge.plist"
launchctl print "gui/$(id -u)/com.family-dashboard.ego-bridge"
```

修改配置后重新加载：

```sh
launchctl bootout "gui/$(id -u)/com.family-dashboard.ego-bridge"
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.family-dashboard.ego-bridge.plist"
```

日志在 `~/Library/Logs/FamilyDashboard/`。桥接服务不负责打开或初始化 ego-lite；可将 ego-lite 加入该用户的“登录项”。

### C. Mac 作为服务器的限制

- 保持该 macOS 用户的图形会话已登录，ego-lite 已启动；退出登录会结束用户级工作器，不是无人登录也可运行的系统服务。
- 锁屏与退出登录不同，但仍应在目标 Mac 实测锁屏后的浏览器可用性；首次授权/验证码等提示需要人工处理。
- 机器睡眠会导致接口不可用；通过系统设置按实际需求配置供电与防睡眠。这里不自动改变电源、安全或自动登录设置。
- 外部用户仍须通过前文所述已认证的 HTTPS 同源代理访问，不要暴露 CLI 控制端口，也不要把 Vite 开发服务器开放到公网。

## 4. 从服务器验证

```sh
# 在 Node 主机，使用同一 shell 中的环境密钥：
curl -sS http://127.0.0.1:3001/api/ego-browser/health \
  -H "X-Ego-Bridge-Token: $EGO_BRIDGE_TOKEN"

curl -sS http://127.0.0.1:3001/api/ego-browser/search-video \
  -H "X-Ego-Bridge-Token: $EGO_BRIDGE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"siteId":"site_bilibili","query":"八段锦教学"}'
```

网页中可输入以下指令，开发者工具 Network 应出现 POST 请求：

- `在B站找八段锦教学视频`（B站）
- `在抖音搜索八段锦教学视频`（抖音）
- `帮爸爸去抖音上找番茄炒蛋教学视频`
- `在 douyin 找八段锦教学视频`

抖音请求使用 `{"siteId":"site_douyin","query":"八段锦教学视频"}`，服务器构造 `https://www.douyin.com/search/<编码关键词>?type=video`。
只提取真实的 `https://www.douyin.com/video/<数字ID>` 链接，ID 始终按字符串保留，避免长整数精度丢失。
抖音链接会通过官方 `open.douyin.com/player/video` 接入可关闭的页内播放弹窗；部分视频可能限制嵌入或要求登录，仍可在原网站打开。

- **没有 POST 请求**：检查前端是否已重新构建/部署，`search_video_with_browser` 是否已启用。明确的视频意图现在由应用确定性执行，不会被模型“没有工具”的文字回复截断。
- **404 或返回 HTML**：未部署 API 或 `/api` 代理错误；只有静态页面不够。
- **401**：代理没有传服务端密钥或与 Node 配置不一致。
- **CLI_NOT_FOUND**：Node 进程找不到 CLI。设置 `EGO_BROWSER_BIN` 的绝对路径后重启。
- **BROWSER_FAILED / BROWSER_NOT_READY**：检查同账号 ego-lite 是否已启动、初始化及会话可访问。
- **BROWSER_TIMEOUT**：可能网站网络失败、登录/验证码阻塞或选择器变化。检查浏览器任务空间后手动处理；不自动重试绕过用户控制。
- **429**：当前单浏览器工作器正在处理另一个请求，稍后重新提交。

CLI 的脚本日志在部分版本写到 stderr；桥接服务同时读取两条输出流，只解析固定 JSON 标记。同时主动关闭 stdin，避免非交互调用一直等输入。

## 京东商品搜索

采购 Agent 已复用此桥接服务接入真实京东商品、页面价格和优惠条件。
接口为 `POST /api/ego-browser/search-products`，请求仅含 `siteId: "site_jd"` 与 `query`。
先在聊天中确认类型、品牌、规格和预算，再查询京东；淘宝及天猫搜索已取消，服务端拒绝相关请求。详见 [京东采购需求问答](shopping-comparison.md)。

## 结果与安全边界

- 仅接受服务器白名单里的 `siteId` 与最多 200 字的 `query`；不接受客户端 URL、domain、命令或脚本。
- `usesBrowserSite` 是前端图谱的能力配置；真正的执行边界是服务端白名单、固定脚本、进程超时和代理认证。不能相信可在客户端修改的图谱来做授权。
- B站已完成本机应用链路验证；抖音搜索网页已在本机验证能返回真实视频详情链接，其官方播放器也已确认能加载视频。抖音应用端到端联调尚需完成，搜索成功与否仍取决于实际网络、登录和站点状态。必应提取器仍需在目标环境验证。下厨房普通菜谱页面不是视频详情页，暂时返回“不支持”，不伪装成视频。
- 遇到明确的登录/安全验证阻塞时，工作器将任务交回用户并返回 `BROWSER_NEEDS_ATTENTION`（HTTP 409）；在对应浏览器任务空间手动处理后重新搜索，不自动绕过或改用私有接口。
- 仅返回 DOM 提取出的合法 HTTPS 视频详情链接。结果页/错误/模拟回退不会标成搜索成功。BrowserTaskRun 记录 running / succeeded / failed 及错误。
- “首选”指网站搜索顺序中的第一个有效视频，**不是经过内容审阅、儿童安全认证或医学权威性验证的最佳视频**。
- 每个任务使用独立任务空间，成功后关闭。遇到错误/用户接管时停止并保留现场供人工检查。
- 当前工作器为单个受信任家庭设计，使用同一个操作系统账号及浏览器登录态；不是多租户隔离方案。上线多人服务前需要租户隔离、独立浏览器身份、服务端作业审计和权限系统。图谱中的执行记录目前仍随现有用户数据保存在客户端，不是防篡改服务端审计日志。
