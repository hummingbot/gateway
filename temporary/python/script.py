import os
import ssl
from pathlib import Path

import requests

protocol = os.environ.get("REST_PROTOCOL", "https")
host = os.environ.get("HOST", "localhost")
port = os.environ.get("PORT", "15888")
client_cert = Path(os.path.dirname(os.path.abspath(__file__)), "../../certs/client_cert.pem").absolute().resolve().as_posix()
client_key = Path(os.path.dirname(os.path.abspath(__file__)), "../../certs/client_key.pem").absolute().resolve().as_posix()
ca_cert = Path(os.path.dirname(os.path.abspath(__file__)), "../../certs/ca_cert.pem").absolute().resolve().as_posix()

ssl_defaults = ssl.get_default_verify_paths()
ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE


def amm_price():
    url = f"{protocol}://{host}:{port}/amm/price"

    response = requests.post(
        url,
        json={
            "quote": "TON",
            "base": "USDT",
            "amount": "1",
            "chain": "ton",
            "network": "mainnet",
            "connector": "stonfi",
            "side": "BUY"
        },
        cert=(client_cert, client_key),
        verify=False,  # In a production environment, you should verify SSL certificates
        # verify=ca_cert
    )

    if response.status_code == 200:
        return response.json()
    else:
        raise Exception("Authentication failed")


if __name__ == "__main__":
    try:
        print(amm_price())
    except Exception as exception:
        print(exception)
