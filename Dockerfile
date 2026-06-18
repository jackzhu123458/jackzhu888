# ====== 阶段1: 依赖安装 ======
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ====== 阶段2: 构建 ======
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV COZE_PROJECT_ENV=PROD

RUN pnpm next build && \
    pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

# 剔除开发依赖，减小镜像体积
RUN pnpm prune --prod

# ====== 阶段3: 生产运行 ======
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV COZE_PROJECT_ENV=PROD
ENV TESSERACT_LANG_PATH=/app/lang-data

# tesseract.js 自带 WASM 引擎，仅需 libc6-compat 兼容层
RUN apk add --no-cache libc6-compat

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# 预下载 Tesseract.js 中文+英文语言数据（避免运行时从国外 CDN 下载超时）
RUN mkdir -p /app/lang-data && \
    wget -q -O /app/lang-data/chi_sim.traineddata \
      "https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/chi_sim.traineddata" && \
    wget -q -O /app/lang-data/eng.traineddata \
      "https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/eng.traineddata" && \
    chown -R nextjs:nodejs /app/lang-data

# 确保 nextjs 用户有权限访问临时目录
RUN mkdir -p /tmp/tesseract-output && chown nextjs:nodejs /tmp/tesseract-output

USER nextjs

EXPOSE 5000

CMD ["node", "dist/server.js"]
