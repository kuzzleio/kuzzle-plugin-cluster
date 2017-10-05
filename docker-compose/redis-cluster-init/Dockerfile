FROM ruby
MAINTAINER Kuzzle <support@kuzzle.io>

RUN  gem install redis \
  && curl -SLO http://download.redis.io/redis-stable/src/redis-trib.rb \
  && chmod a+x redis-trib.rb

COPY docker-entrypoint.sh /

ENTRYPOINT [ "/docker-entrypoint.sh" ]
