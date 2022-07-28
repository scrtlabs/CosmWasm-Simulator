import rawTxs from "./txs.json";

type Coin = {
  amount: string;
  denom: string;
};

type Tx = {
  type: "instantiate" | "execute";
  msg: any;
  env: {
    block: {
      height: number;
      time: string /* nanoseconds since unix epoch */;
      chain_id: string;
    };
    transaction: {
      index: number;
    };
    contract: {
      address: string;
    };
  };
  info: {
    sender: string;
    funds: Coin[];
  };
};

export const txs: Tx[] = [];

for (const rawTx of rawTxs) {
  for (let msgIndex = 0; msgIndex < rawTx.tx.body.messages.length; msgIndex++) {
    // Msg Type
    let type: "instantiate" | "execute" = "instantiate";
    if (
      rawTx.tx.body.messages[msgIndex]["@type"] ===
      "/cosmwasm.wasm.v1.MsgExecuteContract"
    ) {
      type = "execute";
    }

    // Find contract address on init too
    const contractAddress = rawTx.logs[msgIndex].events
      .find((e) =>
        e.attributes.find((attr) => attr.key === "_contract_address")
      )!
      .attributes.find((attr) => attr.key === "_contract_address")!.value;

    txs.push({
      type,
      msg: rawTx.tx.body.messages[msgIndex].msg,
      env: {
        block: {
          height: Number(rawTx.height),
          time: `${new Date(rawTx.timestamp).getTime()}000000`, // ms to ns since unix epoch
          chain_id: "juno-1",
        },
        transaction: {
          index: msgIndex,
        },
        contract: {
          address: contractAddress,
        },
      },
      info: {
        sender: rawTx.tx.body.messages[msgIndex].sender,
        funds: rawTx.tx.body.messages[msgIndex].funds,
      },
    });
  }
}
