# The stage: a virtual 1920x1080 screen with two Chromium windows (the phone on the
# left, the world on the right), recorded by ffmpeg. server.mjs runs the scene.
FROM node:24-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium xvfb ffmpeg ca-certificates fonts-noto-core fonts-noto-color-emoji fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /stage
COPY server.mjs phone.html ./
ENV DISPLAY=:99 NODE_ENV=production
EXPOSE 8080
CMD ["node", "/stage/server.mjs"]
