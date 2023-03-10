import { Provider, TransactionRequest } from "@ethersproject-xdc/abstract-provider";
import { ExternallyOwnedAccount, Signer, TypedDataDomain, TypedDataField, TypedDataSigner } from "@ethersproject-xdc/abstract-signer";
import { Bytes, BytesLike, SignatureLike } from "@ethersproject-xdc/bytes";
import { Mnemonic } from "@ethersproject-xdc/hdnode";
import { SigningKey } from "@ethersproject-xdc/signing-key";
import { ProgressCallback } from "@ethersproject-xdc/json-wallets";
import { Wordlist } from "@ethersproject-xdc/wordlists";
export declare class Wallet extends Signer implements ExternallyOwnedAccount, TypedDataSigner {
    readonly address: string;
    readonly provider: Provider;
    readonly _signingKey: () => SigningKey;
    readonly _mnemonic: () => Mnemonic;
    constructor(privateKey: BytesLike | ExternallyOwnedAccount | SigningKey, provider?: Provider);
    get mnemonic(): Mnemonic;
    get privateKey(): string;
    get publicKey(): string;
    getAddress(): Promise<string>;
    connect(provider: Provider): Wallet;
    signTransaction(transaction: TransactionRequest): Promise<string>;
    signMessage(message: Bytes | string): Promise<string>;
    _signTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, value: Record<string, any>): Promise<string>;
    encrypt(password: Bytes | string, options?: any, progressCallback?: ProgressCallback): Promise<string>;
    /**
     *  Static methods to create Wallet instances.
     */
    static createRandom(options?: any): Wallet;
    static fromEncryptedJson(json: string, password: Bytes | string, progressCallback?: ProgressCallback): Promise<Wallet>;
    static fromEncryptedJsonSync(json: string, password: Bytes | string): Wallet;
    static fromMnemonic(mnemonic: string, path?: string, wordlist?: Wordlist): Wallet;
}
export declare function verifyMessage(message: Bytes | string, signature: SignatureLike): string;
export declare function verifyTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, value: Record<string, any>, signature: SignatureLike): string;
//# sourceMappingURL=index.d.ts.map