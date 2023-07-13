import BigNumber from "bignumber.js";
import { TokenStandard } from "../plenty.types";
import { MichelsonMap, OpKind, ParamsWithKind, TezosToolkit, WalletParamsWithKind } from "@taquito/taquito";
import { UniswapishPriceError } from "../../../services/error-handler";
import { cloneDeep } from "lodash";
import { Plenty } from "../plenty";
import { Tezosish } from "../../../services/common-interfaces";
import { logger } from "../../../services/logger";


export const routerSwap = async (
	tezos: Tezosish,
	plenty: Plenty,
	path: string[],
	minimumOut_All: BigNumber[],
	caller: string,
	recipent: string,
	amount: BigNumber,
): Promise<ParamsWithKind[]> => {
	const tokenIn = plenty.getTokenBySymbol(path[0]);
	const routerInstance = await tezos.getContract(plenty.router);

	let DataLiteral: any = [];
	for (let i = 0; i < path.length - 1; i++) {
		const dexconfig = plenty.getPool(path[i], path[i + 1]);
		const pathI1 = plenty.getTokenBySymbol(path[i + 1]);
		const minOut = minimumOut_All[i]
			.multipliedBy(new BigNumber(10).pow(pathI1.decimals))
			.decimalPlaces(0, 1)
			.toString();
		const tokenAddress = pathI1.address;
		const tokenId = pathI1.tokenId ?? 0;
		DataLiteral[i] = {
			exchangeAddress: dexconfig.address,
			minimumOutput: minOut,
			requiredTokenAddress: tokenAddress ?? plenty.router,
			requiredTokenId: tokenId,
		};
	}

	process.env.LOG_PLENTY && console.log('Path: ', path);
	process.env.LOG_PLENTY && console.log('DataLiteral: ', DataLiteral);
	const DataMap = MichelsonMap.fromLiteral(DataLiteral);
	let swapAmount = amount
		.decimalPlaces(0, 1)
		.toString();
	const tokenInCallType = tokenIn.standard;

	const allBatchOperations: ParamsWithKind[] = [];
	if (tokenInCallType === TokenStandard.TEZ) {
		allBatchOperations.push({
			kind: OpKind.TRANSACTION,
			...routerInstance.methods
				.routerSwap(DataMap, swapAmount, recipent)
				.toTransferParams({ amount: Number(swapAmount), mutez: true }),
		});
	} else {
		const tokenInInstance: any = await tezos.getContract(tokenIn.address as string);

		if (tokenInCallType === TokenStandard.FA12) {
			allBatchOperations.push({
				kind: OpKind.TRANSACTION,
				...tokenInInstance.methods.transfer(caller, plenty.router, swapAmount).toTransferParams(),
			});
			allBatchOperations.push({
				kind: OpKind.TRANSACTION,
				...routerInstance.methods.routerSwap(DataMap, swapAmount, recipent).toTransferParams(),
			});
		} else if (tokenInCallType === TokenStandard.FA2) {
			// FA2 Call
			allBatchOperations.push({
				kind: OpKind.TRANSACTION,
				...tokenInInstance.methods
					.transfer([
						{
							from_: caller,
							txs: [
								{
									to_: plenty.router,
									token_id: tokenIn.tokenId,
									amount: swapAmount,
								},
							],
						},
					])
					.toTransferParams(),
			});
			allBatchOperations.push({
				kind: OpKind.TRANSACTION,
				...routerInstance.methods.routerSwap(DataMap, swapAmount, recipent).toTransferParams(),
			});
		} else {
			throw new Error("Invalid Variant");
		}
	}

	return allBatchOperations;
};

export const getBatchOperationsWithLimits = async (
	tezos: TezosToolkit,
	allBatchOperations: WalletParamsWithKind[]
): Promise<WalletParamsWithKind[]> => {
	try {
		let notEnoughTez = false;
		let notRevealed = false;

		const limits = await tezos.estimate
			.batch(allBatchOperations as ParamsWithKind[])
			.then((limits) => limits)
			.catch((err) => {
				const errorMessage = String(err.message);
				if (errorMessage.includes("storage_exhausted")) {
					notEnoughTez = true;
				} else if (errorMessage.includes("reveal")) {
					notRevealed = true;
				}
				return undefined;
			});

		const updatedBatchOperations: WalletParamsWithKind[] = [];
		if (limits !== undefined) {
			allBatchOperations.forEach((op, index) => {
				const gasLimit = new BigNumber(limits[index].gasLimit)
					.plus(new BigNumber(limits[index].gasLimit).multipliedBy(0.3))
					.decimalPlaces(0, 1)
					.toNumber();
				const storageLimit = new BigNumber(limits[index].storageLimit)
					.plus(new BigNumber(limits[index].storageLimit).multipliedBy(0.5))
					.decimalPlaces(0, 1)
					.toNumber();

				updatedBatchOperations.push({
					...op,
					gasLimit,
					storageLimit,
				});
			});
		} else {
			if (notEnoughTez) {
				throw new UniswapishPriceError("NOT_ENOUGH_TEZ");
			} else if (notRevealed) {
				// return the original batch if address is not revealed
				return allBatchOperations;
			}
			throw new UniswapishPriceError("Failed to create transaction batch");
		}

		return cloneDeep(updatedBatchOperations);
	} catch (error: any) {
		logger.error('Plenty: tezos transaction estimate error - ', error);
		throw new UniswapishPriceError('Plenty: ' + error.message);
	}
};