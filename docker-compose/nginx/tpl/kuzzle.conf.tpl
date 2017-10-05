map $http_upgrade $connection_upgrade {
  default upgrade;
  '' close;
}

upstream kuzzle {
{{range $services := service "kuzzle"}}{{scratch.Set "has_services" true}}
  server {{.Address}}:7512; {{end}}
{{with $has_service := scratch.Get "has_services"}}{{if not $has_service}}
  server 127.0.0.1:80; {{end}}{{end}}
}

server {
  listen 7512;

  proxy_read_timeout 3600s;

  location / {
    proxy_pass http://kuzzle;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
  }

{{range $services := service "kuzzle"}}
  location /{{.Node}} {
    rewrite ^/{{.Node}}/?(.*) /$1 last;
    proxy_pass http://{{.Address}}:7512;
  }
{{end}}
}
