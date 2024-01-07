import { ethers } from "ethers";
import { Arbitrum } from "../../chains/arbitrum/arbitrum";
import { NftPerpConfig } from "./nftperp.config";
import { Amm, PositionResponse } from "@nftperp/sdk/types";

export class NftPerp {
    private static _instances: { [name: string]: NftPerp };
    private _chain: Arbitrum;
    private _config: typeof NftPerpConfig.config;
    private _ready: boolean = false;
    private _sdk; SDK;
    public ttl: any;

    private constructor(network: string) {
        this._chain = Arbitrum.getInstance(network);




    }

    async test() {
        const wallet = new ethers.Wallet("aaa", {} as any);
        const nftperp = new SDK({ wallet });
        await nftperp.getPosition(Amm.BAYC);

    }
}
