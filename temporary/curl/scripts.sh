# SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
# CERTIFICATES_FOLDER=$(readlink -f "$SCRIPT_DIR/../../../certs")
CERTIFICATES_FOLDER="/Users/alvaroferreira/Dev/funttastic/hb-gateway/certs"

HOST=https://localhost
PORT=15888

amm_price() {
	send_request \
	--method "POST" \
	--url "/amm/price" \
	--payload "{
      \"quote\": \"TON\",
      \"base\": \"USDT\",
      \"amount\": \"1\",
      \"chain\": \"ton\",
      \"network\": \"mainnet\",
      \"connector\": \"stonfi\",
      \"side\": \"BUY\"
	}"
}

send_request() {
	local method=""
	local host=""
	local port=""
	local url=""
	local payload=""
	local certificates_folder=""

	while [[ $# -gt 0 ]]; do
		case "$1" in
			--method) method="$2"; shift ;;
			--host) host="$2"; shift ;;
			--port) port="$2"; shift ;;
			--url) url="$2"; shift ;;
			--payload) payload="$2"; shift ;;
			--certificates-folder) certificates_folder="$2"; shift ;;
			*) shift ;;
		esac
		shift
	done

	host=${host:-$HOST}
	port=${port:-$PORT}
	certificates_folder=${certificates_folder:-$CERTIFICATES_FOLDER}

	curl -X "$method" \
		--cert "$certificates_folder/client_cert.pem" \
		--key "$certificates_folder/client_key.pem" \
		--cacert "$certificates_folder/ca_cert.pem" \
		--header "Content-Type: application/json" \
		-d "$payload" \
		"$host:$port$url"
}

amm_price
