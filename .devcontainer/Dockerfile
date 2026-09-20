# 用完整 node:22-bookworm（非 slim）—— 內建 openssl（Prisma query engine 需要）與 git，
# 避免在容器內 apt 安裝（網路環境有時連不到 Debian 源）。
FROM node:22-bookworm

WORKDIR /workspace

# 預先建立 node_modules 並交給 node 使用者：compose 的 named volume 以此目錄擁有者初始化，
# 否則非 root 的 node 使用者對 volume 沒有寫入權限（npm ci 會 permission denied）。
RUN mkdir -p /workspace/node_modules && chown -R node:node /workspace

USER node
