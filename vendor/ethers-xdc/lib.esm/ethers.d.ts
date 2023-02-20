import { BaseContract, Contract, ContractFactory } from "@ethersproject-xdc/contracts";
import { BigNumber, FixedNumber } from "@ethersproject-xdc/bignumber";
import { Signer, VoidSigner } from "@ethersproject-xdc/abstract-signer";
import { Wallet } from "@ethersproject-xdc/wallet";
import * as constants from "@ethersproject-xdc/constants";
import * as providers from "@ethersproject-xdc/providers";
import { getDefaultProvider } from "@ethersproject-xdc/providers";
import { Wordlist, wordlists } from "@ethersproject-xdc/wordlists";
import * as utils from "./utils";
import { ErrorCode as errors } from "@ethersproject-xdc/logger";
import type { TypedDataDomain, TypedDataField } from "@ethersproject-xdc/abstract-signer";
import { BigNumberish } from "@ethersproject-xdc/bignumber";
import { Bytes, BytesLike, Signature } from "@ethersproject-xdc/bytes";
import { Transaction, UnsignedTransaction } from "@ethersproject-xdc/transactions";
import { version } from "./_version";
declare const logger: utils.Logger;
import { ContractFunction, ContractReceipt, ContractTransaction, Event, EventFilter, Overrides, PayableOverrides, CallOverrides, PopulatedTransaction, ContractInterface } from "@ethersproject-xdc/contracts";
export { Signer, Wallet, VoidSigner, getDefaultProvider, providers, BaseContract, Contract, ContractFactory, BigNumber, FixedNumber, constants, errors, logger, utils, wordlists, version, ContractFunction, ContractReceipt, ContractTransaction, Event, EventFilter, Overrides, PayableOverrides, CallOverrides, PopulatedTransaction, ContractInterface, TypedDataDomain, TypedDataField, BigNumberish, Bytes, BytesLike, Signature, Transaction, UnsignedTransaction, Wordlist };
//# sourceMappingURL=ethers.d.ts.map