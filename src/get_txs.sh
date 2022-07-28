#!/bin/bash

seq 1 5 | parallel --bar -P 1 './junod q txs --events "wasm._contract_address=juno1nzffwccpc43s97zna2z9q7mpwlj0frwdcq5trpvtmz5dna7r48hs6cgj3w" --page {} --limit 100' | jq '.txs[]' | jq -s > txs.json