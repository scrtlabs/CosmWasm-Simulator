#!/bin/bash

seq 1 5 | parallel --bar -P 1 './junod q txs --events "wasm._contract_address=juno188lvtzkvjjhgzrakha6qdg3zlvps3fz6m0s984e0wrnulq4px9zqhnleye" --page {} --limit 100' | jq '.txs[]' | jq -s > txs.json