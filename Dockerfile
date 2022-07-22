FROM node:16-alpine

ENV NODE_ENV production

##
# Prepare system dependencies
##

RUN apk add --no-cache bash ca-certificates git

##
# Build app dependencies
##

USER root
WORKDIR /app
COPY package.json yarn.lock tsconfig.json /app/
RUN --mount=type=secret,id=npmrc,dst=/root/.npmrc \
    # Build
    mkdir /yarncache && \
    yarn install --production --network-concurrency 1 --cache-folder /yarncache --frozen-lockfile && \
    yarn cache clean && \
    rm -rf /yarncache && \
    chown 101:101 -R /app

##
# Buid app
##

USER 101
COPY --chown=101 .deploy /app/.deploy
COPY --chown=101 src /app/src
COPY --chown=101 bin /app/bin
RUN yarn build && \
    mkdir /app/.snapshot && \
    chmod +x bin/*.sh

##
# Prepare for execution
##

ARG SENTRY_RELEASE=none
ENV SENTRY_RELEASE $SENTRY_RELEASE

ENV PORT=3000
EXPOSE 3000/tcp
HEALTHCHECK --interval=30s CMD ["/app/bin/liveness.sh"]

CMD ["/usr/local/bin/node", "lib/app.js"]
