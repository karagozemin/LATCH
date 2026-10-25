import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





export interface Hold {
  captured_amount: i128;
  expires_at: u32;
  id: u64;
  maximum: i128;
  merchant: string;
  reference: Buffer;
  status: HoldStatus;
}

export type HoldStatus = {tag: "Active", values: void} | {tag: "Captured", values: void} | {tag: "Voided", values: void} | {tag: "Expired", values: void};


export interface HoldVerification {
  active: boolean;
  expires_at: u32;
  guaranteed: boolean;
  maximum: i128;
  merchant: string;
  reference: Buffer;
}

export const LatchError = {
  1: {message:"ForbiddenSelfCall"},
  2: {message:"DirectTokenCallsDisabled"},
  3: {message:"ForbiddenOperation"},
  4: {message:"ReservedBalanceViolation"},
  5: {message:"HoldNotFound"},
  6: {message:"HoldNotActive"},
  7: {message:"ExceedsHoldMaximum"},
  8: {message:"HoldExpired"},
  9: {message:"InsufficientAvailable"},
  10: {message:"TooManyHolds"},
  11: {message:"HoldDurationTooLong"},
  12: {message:"InvalidAmount"},
  13: {message:"InvalidExpiration"},
  14: {message:"BalanceBackingLost"},
  15: {message:"ArithmeticOverflow"}
}








export interface Client {
  /**
   * Construct and simulate a pay transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pay: ({to, amount}: {to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a sync transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  sync: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a void transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  void_: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a owner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  owner: (options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a capture transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  capture: ({id, amount}: {id: u64, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  deposit: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_hold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_hold: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Hold>>>

  /**
   * Construct and simulate a available transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  available: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a create_hold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_hold: ({merchant, maximum, expires_at, reference}: {merchant: string, maximum: i128, expires_at: u32, reference: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a verify_hold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  verify_hold: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<HoldVerification>>>

  /**
   * Construct and simulate a real_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  real_balance: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a mirror_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  mirror_balance: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a total_reserved transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_reserved: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {owner, token}: {owner: Buffer, token: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({owner, token}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAAAAAAADcGF5AAAAAAIAAAAAAAAAAnRvAAAAAAAUAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAfQAAAACkxhdGNoRXJyb3IAAA==",
        "AAAAAAAAAAAAAAAEc3luYwAAAAAAAAABAAAACw==",
        "AAAAAAAAAAAAAAAEdm9pZAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+kAAAACAAAH0AAAAApMYXRjaEVycm9yAAA=",
        "AAAAAAAAAAAAAAAFb3duZXIAAAAAAAAAAAAAAQAAA+4AAAAg",
        "AAAAAAAAAAAAAAAFdG9rZW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAHY2FwdHVyZQAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAACAAAH0AAAAApMYXRjaEVycm9yAAA=",
        "AAAAAAAAAAAAAAAHZGVwb3NpdAAAAAACAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAACAAAH0AAAAApMYXRjaEVycm9yAAA=",
        "AAAAAAAAAAAAAAAIZ2V0X2hvbGQAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPpAAAH0AAAAARIb2xkAAAH0AAAAApMYXRjaEVycm9yAAA=",
        "AAAAAAAAAAAAAAAJYXZhaWxhYmxlAAAAAAAAAAAAAAEAAAPpAAAACwAAB9AAAAAKTGF0Y2hFcnJvcgAA",
        "AAAAAAAAAAAAAAALY3JlYXRlX2hvbGQAAAAABAAAAAAAAAAIbWVyY2hhbnQAAAATAAAAAAAAAAdtYXhpbXVtAAAAAAsAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAQAAAAAAAAACXJlZmVyZW5jZQAAAAAAA+4AAAAgAAAAAQAAA+kAAAAGAAAH0AAAAApMYXRjaEVycm9yAAA=",
        "AAAAAAAAAAAAAAALdmVyaWZ5X2hvbGQAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAB9AAAAAQSG9sZFZlcmlmaWNhdGlvbgAAB9AAAAAKTGF0Y2hFcnJvcgAA",
        "AAAAAAAAAAAAAAAMX19jaGVja19hdXRoAAAAAwAAAAAAAAARc2lnbmF0dXJlX3BheWxvYWQAAAAAAAPuAAAAIAAAAAAAAAAJc2lnbmF0dXJlAAAAAAAD7gAAAEAAAAAAAAAADWF1dGhfY29udGV4dHMAAAAAAAPqAAAH0AAAAAdDb250ZXh0AAAAAAEAAAPpAAAAAgAAB9AAAAAKTGF0Y2hFcnJvcgAA",
        "AAAAAAAAAAAAAAAMcmVhbF9iYWxhbmNlAAAAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABW93bmVyAAAAAAAD7gAAACAAAAAAAAAABXRva2VuAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAObWlycm9yX2JhbGFuY2UAAAAAAAAAAAABAAAACw==",
        "AAAAAAAAAAAAAAAOdG90YWxfcmVzZXJ2ZWQAAAAAAAAAAAABAAAD6QAAAAsAAAfQAAAACkxhdGNoRXJyb3IAAA==",
        "AAAAAQAAAAAAAAAAAAAABEhvbGQAAAAHAAAAAAAAAA9jYXB0dXJlZF9hbW91bnQAAAAACwAAAAAAAAAKZXhwaXJlc19hdAAAAAAABAAAAAAAAAACaWQAAAAAAAYAAAAAAAAAB21heGltdW0AAAAACwAAAAAAAAAIbWVyY2hhbnQAAAATAAAAAAAAAAlyZWZlcmVuY2UAAAAAAAPuAAAAIAAAAAAAAAAGc3RhdHVzAAAAAAfQAAAACkhvbGRTdGF0dXMAAA==",
        "AAAAAgAAAAAAAAAAAAAACkhvbGRTdGF0dXMAAAAAAAQAAAAAAAAAAAAAAAZBY3RpdmUAAAAAAAAAAAAAAAAACENhcHR1cmVkAAAAAAAAAAAAAAAGVm9pZGVkAAAAAAAAAAAAAAAAAAdFeHBpcmVkAA==",
        "AAAAAQAAAAAAAAAAAAAAEEhvbGRWZXJpZmljYXRpb24AAAAGAAAAAAAAAAZhY3RpdmUAAAAAAAEAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAQAAAAAAAAACmd1YXJhbnRlZWQAAAAAAAEAAAAAAAAAB21heGltdW0AAAAACwAAAAAAAAAIbWVyY2hhbnQAAAATAAAAAAAAAAlyZWZlcmVuY2UAAAAAAAPuAAAAIA==",
        "AAAABAAAAAAAAAAAAAAACkxhdGNoRXJyb3IAAAAAAA8AAAAAAAAAEUZvcmJpZGRlblNlbGZDYWxsAAAAAAAAAQAAAAAAAAAYRGlyZWN0VG9rZW5DYWxsc0Rpc2FibGVkAAAAAgAAAAAAAAASRm9yYmlkZGVuT3BlcmF0aW9uAAAAAAADAAAAAAAAABhSZXNlcnZlZEJhbGFuY2VWaW9sYXRpb24AAAAEAAAAAAAAAAxIb2xkTm90Rm91bmQAAAAFAAAAAAAAAA1Ib2xkTm90QWN0aXZlAAAAAAAABgAAAAAAAAASRXhjZWVkc0hvbGRNYXhpbXVtAAAAAAAHAAAAAAAAAAtIb2xkRXhwaXJlZAAAAAAIAAAAAAAAABVJbnN1ZmZpY2llbnRBdmFpbGFibGUAAAAAAAAJAAAAAAAAAAxUb29NYW55SG9sZHMAAAAKAAAAAAAAABNIb2xkRHVyYXRpb25Ub29Mb25nAAAAAAsAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAAMAAAAAAAAABFJbnZhbGlkRXhwaXJhdGlvbgAAAAAAAA0AAAAAAAAAEkJhbGFuY2VCYWNraW5nTG9zdAAAAAAADgAAAAAAAAASQXJpdGhtZXRpY092ZXJmbG93AAAAAAAP",
        "AAAABQAAAAAAAAAAAAAABFBhaWQAAAABAAAABHBhaWQAAAADAAAAAAAAAAJ0bwAAAAAAFAAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAADW5ld19hdmFpbGFibGUAAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAACURlcG9zaXRlZAAAAAAAAAEAAAAJZGVwb3NpdGVkAAAAAAAAAwAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAApuZXdfbWlycm9yAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAACkhvbGRWb2lkZWQAAAAAAAEAAAALaG9sZF92b2lkZWQAAAAAAgAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAhtZXJjaGFudAAAABMAAAABAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAC0hvbGRDcmVhdGVkAAAAAAEAAAAMaG9sZF9jcmVhdGVkAAAABAAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAhtZXJjaGFudAAAABMAAAABAAAAAAAAAAdtYXhpbXVtAAAAAAsAAAAAAAAAAAAAAApleHBpcmVzX2F0AAAAAAAEAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAEAAAALaW5pdGlhbGl6ZWQAAAAAAgAAAAAAAAAFb3duZXIAAAAAAAPuAAAAIAAAAAAAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADEhvbGRDYXB0dXJlZAAAAAEAAAANaG9sZF9jYXB0dXJlZAAAAAAAAAQAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAIbWVyY2hhbnQAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAIcmVsZWFzZWQAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADUJhbGFuY2VTeW5jZWQAAAAAAAABAAAADmJhbGFuY2Vfc3luY2VkAAAAAAACAAAAAAAAAApvbGRfbWlycm9yAAAAAAALAAAAAAAAAAAAAAAKbmV3X21pcnJvcgAAAAAACwAAAAAAAAAC" ]),
      options
    )
  }
  public readonly fromJSON = {
    pay: this.txFromJSON<Result<void>>,
        sync: this.txFromJSON<i128>,
        void: this.txFromJSON<Result<void>>,
        owner: this.txFromJSON<Buffer>,
        token: this.txFromJSON<string>,
        capture: this.txFromJSON<Result<void>>,
        deposit: this.txFromJSON<Result<void>>,
        get_hold: this.txFromJSON<Result<Hold>>,
        available: this.txFromJSON<Result<i128>>,
        create_hold: this.txFromJSON<Result<u64>>,
        verify_hold: this.txFromJSON<Result<HoldVerification>>,
        real_balance: this.txFromJSON<i128>,
        mirror_balance: this.txFromJSON<i128>,
        total_reserved: this.txFromJSON<Result<i128>>
  }
}