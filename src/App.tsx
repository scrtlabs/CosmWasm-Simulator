import { fromBase64, fromUtf8, toUtf8 } from "secretjs";
import {
  MsgRevoke,
  MsgGrant,
} from "secretjs/dist/protobuf_stuff/cosmos/authz/v1beta1/tx";
import { GenericAuthorization } from "secretjs/dist/protobuf_stuff/cosmos/authz/v1beta1/authz";
import { txs } from "./txs";

let instance: WebAssembly.Instance;
const state: any = {};

function memoryWrite(value: Uint8Array): number {
  const region = (instance.exports.allocate as Function)(value.length);
  const memory = new Uint8Array(
    (instance.exports.memory as WebAssembly.Memory).buffer
  );

  // CosmWasm pointers are "Regions"
  // A region is a 12 bytes sequence that looks like this:
  // region -> | 4byte = buffer_addr | 4bytes = buffer_cap | 4bytes = buffer_len |
  const ptr = new DataView(memory.buffer).getUint32(region, true);
  const cap = new DataView(memory.buffer).getUint32(region + 4, true);

  if (cap < value.length) {
    throw Error(`Error allocating ${value.length} bytes, got only ${cap}`);
  }

  for (let i = 0; i < value.length; i++) {
    memory[ptr + i] = value[i];
  }

  // Set len to cap
  memory[region + 8] = memory[region + 4];
  memory[region + 9] = memory[region + 5];
  memory[region + 10] = memory[region + 6];
  memory[region + 11] = memory[region + 7];

  return region;
}

function memoryRead(region: number): Uint8Array {
  const memory = new Uint8Array(
    (instance.exports.memory as WebAssembly.Memory).buffer
  );
  // CosmWasm pointers are "Regions"
  // A region is a 12 bytes sequence that looks like this:
  // region -> | 4byte = buffer_addr | 4bytes = buffer_cap | 4bytes = buffer_len |
  const ptr = new DataView(memory.buffer).getUint32(region, true);
  const cap = new DataView(memory.buffer).getUint32(region + 4, true);
  const len = new DataView(memory.buffer).getUint32(region + 8, true);

  return memory.slice(ptr, ptr + len);
}

(async () => {
  const importObject = {
    env: {
      db_read: (key_ptr: number): number => {
        const key = fromUtf8(memoryRead(key_ptr));

        console.log("db_read", key);

        const value = state[key];

        return memoryWrite(toUtf8(value));
      },

      db_write: (key_ptr: number, value_ptr: number) => {
        const key = fromUtf8(memoryRead(key_ptr));
        const value = fromUtf8(memoryRead(value_ptr));

        console.log("db_write", key, value);

        state[key] = value;
      },

      db_remove: (key_ptr: number) => {
        const key = fromUtf8(memoryRead(key_ptr));

        console.log("db_remove", key);

        delete state[key];
      },

      db_scan: (start_ptr: number, end_ptr: number, order: number): number => {
        console.log("db_scan", start_ptr, end_ptr, order);
        return 0;
      },

      db_next: (iterator_id: number): number => {
        console.log("db_next", iterator_id);
        return 0;
      },

      addr_validate: (source_ptr: number): number => {
        console.log("addr_validate", fromUtf8(memoryRead(source_ptr)));
        return 0;
      },

      addr_canonicalize: (
        source_ptr: number,
        destination_ptr: number
      ): number => {
        console.log(
          "addr_canonicalize",
          fromUtf8(memoryRead(source_ptr)),
          destination_ptr
        );
        return 0;
      },

      addr_humanize: (source_ptr: number, destination_ptr: number): number => {
        console.log("addr_humanize", memoryRead(source_ptr), destination_ptr);
        return 0;
      },

      secp256k1_verify: (
        message_hash_ptr: number,
        signature_ptr: number,
        public_key_ptr: number
      ): number => {
        console.log(
          "secp256k1_verify",
          message_hash_ptr,
          signature_ptr,
          public_key_ptr
        );

        return 0;
      },

      secp256k1_recover_pubkey: (
        message_hash_ptr: number,
        signature_ptr: number,
        recovery_param: number
      ): number => {
        console.log(
          "secp256k1_recover_pubkey",
          message_hash_ptr,
          signature_ptr,
          recovery_param
        );

        return 0;
      },
      ed25519_verify: (
        message_ptr: number,
        signature_ptr: number,
        public_key_ptr: number
      ): number => {
        console.log(
          "ed25519_verify",
          message_ptr,
          signature_ptr,
          public_key_ptr
        );

        return 0;
      },

      ed25519_batch_verify: (
        messages_ptr: number,
        signatures_ptr: number,
        public_keys_ptr: number
      ): number => {
        console.log(
          "ed25519_batch_verify",
          messages_ptr,
          signatures_ptr,
          public_keys_ptr
        );

        return 0;
      },

      debug: (source_ptr: number) => {
        console.log("debug", fromUtf8(memoryRead(source_ptr)));
      },

      query_chain: (request: number): number => {
        console.log("query_chain", fromUtf8(memoryRead(request)));

        return 0;
      },
    },
  };

  /* 
      fn interface_version_8() -> () {}

      fn allocate(size: usize) -> u32;
      fn deallocate(pointer: u32);

      fn instantiate(env_ptr: u32, info_ptr: u32, msg_ptr: u32) -> u32;
      fn execute(env_ptr: u32, info_ptr: u32, msg_ptr: u32) -> u32;
      fn query(env_ptr: u32, msg_ptr: u32) -> u32;
   */

  WebAssembly.instantiateStreaming(fetch("/578.wasm"), importObject).then(
    (wasm) => {
      instance = wasm.instance;

      for (const tx of txs) {
        const msg = JSON.stringify(tx.msg);
        const msgPtr = memoryWrite(toUtf8(msg));
        const envPtr = memoryWrite(toUtf8(JSON.stringify(tx.env)));
        const infoPtr = memoryWrite(toUtf8(JSON.stringify(tx.info)));

        console.log("input", tx.type, msg);

        const resultRegion = (wasm.instance.exports[tx.type] as Function)(
          envPtr,
          infoPtr,
          msgPtr
        );

        const output = fromUtf8(memoryRead(resultRegion));
        const outputJSON = JSON.parse(output);
        console.log("output", output);

        for (const { msg } of outputJSON.ok.messages) {
          console.log("output msg", msg);

          if (msg?.stargate?.value) {
            if (msg?.stargate?.type_url === "/cosmos.authz.v1beta1.MsgGrant") {
              const x = MsgGrant.decode(fromBase64(msg?.stargate?.value));
              if (x?.grant?.authorization?.value) {
                // @ts-expect-error
                x.grant.authorization.value = GenericAuthorization.decode(
                  x.grant.authorization.value
                );
              }

              console.log("output msg protobuf", JSON.stringify(x, null, 4));
            } else if (
              msg?.stargate?.type_url === "/cosmos.authz.v1beta1.MsgRevoke"
            ) {
              console.log(
                "output msg protobuf",
                JSON.stringify(
                  MsgRevoke.decode(fromBase64(msg?.stargate?.value)),
                  null,
                  4
                )
              );
            } else {
              console.log(
                "cannot decode output msg protobuf - needs protobuf definitions",
                JSON.stringify(msg?.stargate)
              );
            }
          }
        }

        console.log("state", state);

        const replyMsg = JSON.stringify({
          id: 2,
          result: {
            ok: {
              events: [],
              data: "",
            },
          },
        });

        const replyMsgPtr = memoryWrite(toUtf8(replyMsg));
        const replyEnvPtr = memoryWrite(toUtf8(JSON.stringify(tx.env)));
        // const infoPtr = memoryWrite(toUtf8(JSON.stringify(tx.info)));

        // @ts-ignore
        tx.type = "reply";

        console.log("input", tx.type, replyMsg);

        const replyResultRegion = (wasm.instance.exports[tx.type] as Function)(
          replyEnvPtr,
          // infoPtr,
          replyMsgPtr
        );

        console.log("output", fromUtf8(memoryRead(replyResultRegion)));

        console.log("state", state);
      }
    }
  );
})();
