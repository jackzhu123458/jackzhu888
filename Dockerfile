# ========================================
# 新顺电器仓库进销存管理系统 - Docker 部署
# ========================================

# 多阶段构建：依赖安装 → 构建 → 运行

# 阶段1：安装依赖
FROM node:24-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 阶段2：构建
FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# 阶段3：运行（最小镜像）
FROM node:24-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

ENV NODE_ENV=production
ENV DEPLOY_RUN_PORT=5000

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 复制必要配置文件
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

USER nextjs

EXPOSE 5000

# 使用 standalone 模式启动（如不可用则降级到 next start）
CMD ["sh", "-c", "if [ -f server.js ]; then node server.js; else npx next start -p ${DEPLOY_RUN_PORT}; fi"]
