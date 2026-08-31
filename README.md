# Supportly：自动化多渠道 AI 客服

单企业私有部署的客服系统。管理后台、访客客服前台和服务端是三个独立应用，可以分别开发、构建和部署。

当前支持网页聊天、网站浮窗 SDK 和 Telegram Bot 私聊。AI 只根据角色绑定的知识库回答；没有有效来源、用户要求人工、AI 或 Qdrant 异常时，会保留消息并进入人工队列。

## 工程结构

```text
apps/
  admin/                     # 客服管理后台，Next.js，端口 8001
    src/features/            # 按业务功能拆分页面与组件
  support/                   # 访客客服网页和 widget.js，Next.js，端口 8002
    src/features/chat/
    public/widget.js
  server/                    # Express 服务端，端口 8000
    src/bootstrap/           # 应用装配与进程启动
    src/http/routes/         # admin / public / integrations 接口
    src/modules/             # AI、会话、知识库、渠道业务
    src/infrastructure/      # PostgreSQL 外围、Qdrant、媒体和安全
    src/scripts/             # migration、管理员初始化
db/
  migrations/                # 顺序 SQL migration
packages/
  typescript-config/         # 共享 TypeScript 配置
```

接口边界：

```text
/api/admin/*                 # 管理后台，Cookie 会话保护
/api/public/*                # 网页访客接口，访客令牌保护
/api/integrations/*          # Telegram 等渠道 Webhook
/api/health                  # 服务健康检查
```

PostgreSQL 是业务事实来源；Qdrant 只保存向量与分块 ID。已有数据由 migration 回填到默认知识库，不会因应用目录调整而迁移或删除。

## 环境要求

```text
Node.js 22+
pnpm 10.34.5
Docker Desktop / Docker Engine + Compose
```

启用仓库声明的 pnpm 版本并安装依赖：

```bash
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
test -f .env || cp .env.example .env
```

默认 `.env.example` 连接 Docker 暴露到本机的 PostgreSQL、Redis 和 Qdrant。如果端口已经被占用，应同时修改基础设施端口和对应连接地址，例如：

```dotenv
POSTGRES_PORT=55432
DATABASE_URL=postgres://app:app@localhost:55432/app
REDIS_PORT=56379
REDIS_URL=redis://localhost:56379
QDRANT_PORT=56333
QDRANT_URL=http://localhost:56333
```

## 本地启动计划

### 首次完整启动

一条命令启动 PostgreSQL、Redis、Qdrant，执行 migration，再同时启动三个应用：

```bash
pnpm local:start
```

本地地址：

```text
管理后台：http://localhost:8001/zh-CN
客服前台：http://localhost:8002/zh-CN/support/wgt_demo
客服 SDK：http://localhost:8002/widget.js
健康检查：http://localhost:8000/api/health
```

`pnpm local:start` 会保持前台进程运行。按 `Ctrl+C` 停止应用进程；基础设施容器继续运行，便于下次开发。

如果项目已有旧 `.env`，请先检查运行模式。`MOCK_MODE=false` 时必须提供有效的
`APP_ENCRYPTION_KEY`；只验证界面和流程时可暂时使用 `MOCK_MODE=true`。缺少密钥时
server 会主动拒绝启动，避免以不安全配置运行：

```bash
rg '^(MOCK_MODE|APP_ENCRYPTION_KEY)=' .env
```

```dotenv
# 本地模拟模式
MOCK_MODE=true
```

或使用真实 AI 模式（密钥不要提交）：

```dotenv
MOCK_MODE=false
APP_ENCRYPTION_KEY=REPLACE_WITH_32_BYTE_BASE64URL_OR_64_HEX
```

停止基础设施但保留数据卷：

```bash
pnpm local:down
```

### 日常开发

基础设施已经运行时，同时启动三个应用：

```bash
pnpm dev
```

单独开发某个应用：

```bash
pnpm dev:server
pnpm dev:admin
pnpm dev:support
```

只管理本地基础设施：

```bash
pnpm local:up
pnpm local:down
```

手动执行 migration：

```bash
pnpm db:migrate
```

首次创建管理员。密码使用环境变量传入，不进入命令参数：

```bash
ADMIN_PASSWORD='replace-with-a-long-password' pnpm admin:create \
  --email admin@example.com \
  --name Administrator \
  --role admin
```

## 根目录命令

```text
pnpm local:start    基础设施 + migration + server/admin/support
pnpm local:up       启动 PostgreSQL、Redis、Qdrant
pnpm local:down     停止基础设施，保留数据卷
pnpm dev            同时启动三个应用
pnpm dev:server     仅启动服务端
pnpm dev:admin      仅启动管理后台
pnpm dev:support    仅启动客服前台
pnpm db:migrate     执行未应用的 SQL migration
pnpm admin:create   创建或更新后台账号
pnpm check          格式、lint、类型和测试
pnpm build          生产构建
```

## Docker Compose 全栈运行

全栈容器包含 Caddy、三个应用和三个数据服务：

```bash
docker compose up --build -d
docker compose ps
curl --fail http://support.localhost:8787/api/health
```

打开：

```text
管理后台：http://admin.localhost:8787/zh-CN
客服前台：http://support.localhost:8787/zh-CN/support/wgt_demo
客服 SDK：http://support.localhost:8787/widget.js
```

Caddy 根据域名分流：

```text
admin.example.com
  /api/admin/* -> server
  其他路径       -> admin

support.example.com
  /api/public/*、/api/integrations/* -> server
  /widget.js 和其他路径              -> support
```

生产环境至少配置：

```dotenv
MOCK_MODE=false
ADMIN_ADDRESS=admin.example.com
SUPPORT_ADDRESS=support.example.com
ADMIN_URL=https://admin.example.com
SUPPORT_URL=https://support.example.com
APP_PORT=80
HTTPS_PORT=443
APP_ENCRYPTION_KEY=REPLACE_WITH_32_BYTE_BASE64URL_OR_64_HEX
OPENAI_API_KEY=REPLACE_WITH_PROVIDER_KEY
OPENAI_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
```

生成主密钥：

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

更换 `APP_ENCRYPTION_KEY` 后，已加密入库的 AI Key 和 Telegram Token 将无法解密，因此该值必须进入生产密钥备份。

## 网页 SDK

```html
<script
  async
  src="https://support.example.com/widget.js"
  data-widget-id="wgt_public_id"
  data-locale="zh-CN"
></script>
```

```javascript
window.SupportWidget = window.SupportWidget || [];

SupportWidget.push([
  "identify",
  {
    externalId: "shop-user-123",
    name: "Customer Name",
    email: "customer@example.com",
  },
]);

SupportWidget.push(["open"]);
SupportWidget.push(["close"]);
SupportWidget.push(["reset"]);
SupportWidget.push(["onUnread", ({ count }) => console.log(count)]);
```

`identify` 资料仅用于客服识别，不作为认证。历史连续性依赖客服域名下的浏览器访客令牌。

## Telegram

在管理后台“渠道”创建 Telegram 渠道并填写 Bot Token。服务先调用 `getMe`，再设置 Webhook：

```text
https://support.example.com/api/integrations/telegram/{connectionId}/webhook
```

Telegram 要求公网 HTTPS 域名。当前只处理 Bot 私聊，群聊更新会被忽略。

## AI 与知识库

真实 AI 服务必须兼容：

```text
POST /chat/completions
POST /embeddings
```

Chat 模型还需支持图片输入和 JSON 文本输出。严格回答流程：

```text
入站消息 -> 图片检索描述 -> Embedding -> Qdrant 检索
         -> PostgreSQL 读取原文 -> AI JSON 回答
         -> 验证来源 ID -> 回答或转人工
```

## 验证

```bash
pnpm check
pnpm build
docker compose config --quiet
```

验证保留的数据数量：

```bash
pnpm db:migrate
psql "$DATABASE_URL" -c "SELECT count(*) AS documents FROM documents;"
psql "$DATABASE_URL" -c "SELECT count(*) AS chunks FROM chunks;"
```

本仓库改造前的验收基线是 2 个文档、79 个分块。

## 备份与恢复

创建备份目录：

```bash
backup_dir="backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
docker compose exec -T postgres pg_dump -U app -d app -Fc > "$backup_dir/postgres.dump"
docker compose cp qdrant:/qdrant/storage "$backup_dir/qdrant-storage"
docker compose cp server:/app/media "$backup_dir/media"
cp .env "$backup_dir/env.backup"
```

恢复会覆盖目标数据，确认目标环境后执行：

```bash
docker compose stop server admin support caddy qdrant
docker compose exec -T postgres dropdb -U app --if-exists app
docker compose exec -T postgres createdb -U app app
docker compose exec -T postgres pg_restore -U app -d app --clean --if-exists < backup-YYYYMMDD-HHMMSS/postgres.dump
docker compose cp backup-YYYYMMDD-HHMMSS/qdrant-storage/. qdrant:/qdrant/storage
docker compose cp backup-YYYYMMDD-HHMMSS/media/. server:/app/media
docker compose start qdrant server admin support caddy
curl --fail http://support.localhost:8787/api/health
```

先在 staging 演练恢复流程，再用于生产环境。

## MVP 边界

当前未实现 WhatsApp、Telegram 群聊、营销群发、订单系统、多企业租户、复杂 RBAC、桌面客户端和原生移动 SDK。
