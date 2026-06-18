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

# 安装 tesseract.js 运行时依赖（图像处理库）
# tesseract.js 需要 libc6-compat 和图形库支持
RUN apk add --no-cache \
    libc6-compat \
    GraphicsMagick \
    ghostscript \
    tesseract-ocr

# 预下载 Tesseract.js 中文语言数据（避免首次 OCR 请求超时）
# 数据会缓存到 /tmp/tesseract.js-* 目录
RUN mkdir -p /tmp/tesseract-lang-data && \
    wget -q -O /tmp/tesseract-lang-data/chi_sim.traineddata.gz \
      "https://github.com/tesseract-ocr/tessdata_fast/raw/main/chi_sim.traineddata.gz" && \
    wget -q -O /tmp/tesseract-lang-data/eng.traineddata.gz \
      "https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata.gz" && \
    gunzip /tmp/tesseract-lang-data/*.gz

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# 确保 nextjs 用户有权限访问临时目录
RUN mkdir -p /tmp/tesseract-output && chown nextjs:nodejs /tmp/tesseract-output

USER nextjs

EXPOSE 5000

CMD ["node", "dist/server.js"]
