FROM kuzzleio/kuzzle

RUN  set -x \
  \
  && npm set user 0 \
  && npm set unsafe-perm true \
  \
  && apt-get update \
  && apt-get install -y \
    build-essential \
    python-dev \
    libzmq3-dev
