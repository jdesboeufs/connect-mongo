#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TLS_DIR="$ROOT_DIR/docker/tls"
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if [[ $FORCE -eq 0 && -f "$TLS_DIR/ca.crt" ]]; then
  echo "TLS fixtures already exist in $TLS_DIR (use --force to regenerate)." >&2
  exit 0
fi

mkdir -p "$TLS_DIR"
rm -f "$TLS_DIR"/*.{crt,key,pem,csr,cnf,srl} 2>/dev/null || true

echo "Generating local CA..."
openssl req \
  -x509 \
  -nodes \
  -days 365 \
  -newkey rsa:4096 \
  -keyout "$TLS_DIR/ca.key" \
  -out "$TLS_DIR/ca.crt" \
  -subj "/CN=connect-mongo-dev CA"

cat >"$TLS_DIR/server.cnf" <<'EOF'
[ req ]
prompt = no
distinguished_name = dn
req_extensions = v3_req

[ dn ]
CN = localhost

[ v3_req ]
keyUsage = digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[ alt_names ]
DNS.1 = localhost
IP.1 = 127.0.0.1
EOF

echo "Generating server certificate..."
openssl req \
  -nodes \
  -newkey rsa:4096 \
  -keyout "$TLS_DIR/server.key" \
  -out "$TLS_DIR/server.csr" \
  -config "$TLS_DIR/server.cnf"

openssl x509 \
  -req \
  -in "$TLS_DIR/server.csr" \
  -CA "$TLS_DIR/ca.crt" \
  -CAkey "$TLS_DIR/ca.key" \
  -CAcreateserial \
  -out "$TLS_DIR/server.crt" \
  -days 365 \
  -sha256 \
  -extensions v3_req \
  -extfile "$TLS_DIR/server.cnf"

cat "$TLS_DIR/server.crt" "$TLS_DIR/server.key" >"$TLS_DIR/server.pem"

cat >"$TLS_DIR/client.cnf" <<'EOF'
[ req ]
prompt = no
distinguished_name = dn
req_extensions = v3_req

[ dn ]
CN = connect-mongo-example

[ v3_req ]
keyUsage = digitalSignature,keyEncipherment
extendedKeyUsage = clientAuth
subjectAltName = @alt_names

[ alt_names ]
DNS.1 = localhost
EOF

echo "Generating optional client certificate..."
openssl req \
  -nodes \
  -newkey rsa:4096 \
  -keyout "$TLS_DIR/client.key" \
  -out "$TLS_DIR/client.csr" \
  -config "$TLS_DIR/client.cnf"

openssl x509 \
  -req \
  -in "$TLS_DIR/client.csr" \
  -CA "$TLS_DIR/ca.crt" \
  -CAkey "$TLS_DIR/ca.key" \
  -CAcreateserial \
  -out "$TLS_DIR/client.crt" \
  -days 365 \
  -sha256 \
  -extensions v3_req \
  -extfile "$TLS_DIR/client.cnf"

cat "$TLS_DIR/client.crt" "$TLS_DIR/client.key" >"$TLS_DIR/client.pem"

rm -f "$TLS_DIR"/*.csr "$TLS_DIR"/*.cnf

echo "TLS fixtures ready in $TLS_DIR"
echo "Use MONGO_TLS_CA_FILE=docker/tls/ca.crt and MONGO_TLS_CERT_KEY_FILE=docker/tls/client.pem when testing mutual TLS."
