import { LedgerJsonApiClient } from '../../clients/ledger-json-api';

export interface AmuletForTransfer {
	contractId: string;
	templateId: string;
	effectiveAmount: string;
	owner: string;
}

export interface GetAmuletsForTransferParams {
	/** Ledger JSON API client for querying active contracts */
	jsonApiClient: LedgerJsonApiClient;
	/** Party IDs to read as (first one is used as sender) */
	readAs?: string[];
}

/**
 * Gets unlocked amulets owned by the sender party that can be used for transfers
 * 
 * @param params - Parameters for getting amulets
 * @returns Promise resolving to array of amulets suitable for transfer
 */
export async function getAmuletsForTransfer(
	params: GetAmuletsForTransferParams
): Promise<AmuletForTransfer[]> {
	const { jsonApiClient, readAs } = params;

	// Query ledger for active contracts for this party (unlocked amulets)
	if (!readAs?.[0]) {
		return [];
	}
	const senderParty = readAs[0];

	const activeContracts = await jsonApiClient.getActiveContracts({
		parties: [senderParty],
	});

	const allAmulets: any[] = [];
	const contractsArr = Array.isArray(activeContracts) ? activeContracts : [];

	contractsArr.forEach((ctr: any) => {
		let payload, templateId, contractId;
		console.log('ctr: ', ctr);

		if (
			ctr.contractEntry &&
			ctr.contractEntry.JsActiveContract &&
			ctr.contractEntry.JsActiveContract.createdEvent
		) {
			const created = ctr.contractEntry.JsActiveContract.createdEvent;
			payload = created.createArgument;
			templateId = created.templateId;
			contractId = created.contractId;
		} else if (ctr.contract) {
			payload = ctr.contract.payload;
			templateId =
				ctr.contract.contract?.template_id || ctr.contract.template_id;
			contractId =
				ctr.contract.contract?.contract_id || ctr.contract.contract_id;
		}

		console.log('payload: ', payload);
		console.log('templateId: ', templateId);
		console.log('contractId: ', contractId);

		if (!payload || !templateId || !contractId) return;

		const isUnlockedAmulet =
			templateId.includes('Splice.Amulet:Amulet') &&
			!templateId.includes('LockedAmulet');
		if (!isUnlockedAmulet) return;

		allAmulets.push({ contractId, templateId, payload });
	});

	// Helper to extract owner and numeric amount from diverse amulet shapes
	const extract = (amulet: any) => {
		const payload =
			amulet?.payload ?? amulet?.contract?.contract?.payload ?? {};
		const ownerFull =
			payload.owner ??
			amulet.owner ??
			amulet.partyId ??
			amulet.party_id ??
			'';
		const rawAmountCandidate =
			payload.amount ??
			amulet.amount ??
			amulet.effective_amount ??
			amulet.effectiveAmount ??
			amulet.initialAmount ??
			'0';
		let rawAmount = rawAmountCandidate;
		if (
			typeof rawAmountCandidate === 'object' &&
			rawAmountCandidate !== null
		) {
			rawAmount = rawAmountCandidate.initialAmount ?? '0';
		}
		const numericAmount = parseFloat(rawAmount as string);
		return { owner: ownerFull, numericAmount };
	};

	// Note: Processing amulets to extract contract information

	// Keep amulets owned by sender (readAs[0]) and with positive balance
	const partyAmulets = allAmulets.filter(a => {
		const { owner, numericAmount } = extract(a);
		return numericAmount > 0 && owner === senderParty;
	});

	if (partyAmulets.length === 0) {
		return [];
	}

	// Sort biggest → smallest so we pick high-value amulets first
	partyAmulets.sort(
		(a, b) => extract(b).numericAmount - extract(a).numericAmount
	);

	// Note: partyAmulets is now sorted by amount (biggest first)

	// Map to the structure expected by buildAmuletInputs
	const result = partyAmulets.map(a => {
		const inner = a.contract?.contract ?? {};
		const payload = inner.payload ?? {};
		const amtObj = payload.amount ?? {};
		const intAmount =
			typeof amtObj === 'object' ? amtObj.initialAmount : amtObj;
		return {
			contractId: inner.contract_id ?? a.contractId ?? a.contract_id,
			templateId:
				inner.template_id ??
				a.templateId ??
				a.template_id ??
				'splice-amulet:Splice.Amulet:Amulet',
			effectiveAmount: a.effective_amount ?? intAmount ?? '0',
			owner: payload.owner ?? extract(a).owner,
		};
	});

	return result;
} 
