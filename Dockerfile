# ====== 阶段1: 依赖安装 ======
# 使用国内镜像源拉取基础镜像，如果加速器已配置则可改回 node:22-alpine
FROM docker.1ms.run/library/node:22-alpine AS deps

# 直接安装 pnpm，跳过 corepack（避免 corepack 访问 npmjs.org 下载失败）
RUN npm install -g pnpm@9 --registry https://registry.npmmirror.com && \
    pnpm config set registry https://registry.npmmirror.com

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
# 删除 packageManager 字段，防止 corepack 强制介入
RUN sed -i '/"packageManager"/d' package.json

RUN pnpm install --frozen-lockfile

# ====== 阶段2: 构建 ======
FROM docker.1ms.run/library/node:22-alpine AS builder

# 直接安装 pnpm
RUN npm install -g pnpm@9 --registry https://registry.npmmirror.com && \
    pnpm config set registry https://registry.npmmirror.com

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 删除 packageManager 字段，防止 corepack 强制介入
RUN sed -i '/"packageManager"/d' package.json

ENV NEXT_TELEMETRY_DISABLED=1
ENV COZE_PROJECT_ENV=PROD

RUN pnpm next build && \
    pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

# 剔除开发依赖，减小镜像体积
RUN pnpm prune --prod

# ====== 阶段3: 生产运行 ======
FROM docker.1ms.run/library/node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV COZE_PROJECT_ENV=PROD

RUN apk add --no-cache libc6-compat

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# 创建上传目录
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 5000

CMD ["node", "dist/server.js"]
