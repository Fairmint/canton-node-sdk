import type { ClientConfig } from '../../core';
import { WebSocketHandlers, WebSocketSubscription } from '../../core/ws';
import { LedgerJsonApiClient as GeneratedLedgerJsonApiClient } from './LedgerJsonApiClient.generated';
import { SubscribeToCompletions } from './operations/v2/commands/subscribe-to-completions';
import { SubscribeToActiveContracts } from './operations/v2/state/subscribe-to-active-contracts';
import { SubscribeToFlats } from './operations/v2/updates/subscribe-to-flats';
import { SubscribeToTrees } from './operations/v2/updates/subscribe-to-trees';

export class LedgerJsonApiClient extends GeneratedLedgerJsonApiClient {
	constructor(clientConfig?: ClientConfig) {
		super(clientConfig);
	}

	public subscribeToCompletions(
		params: Parameters<InstanceType<typeof SubscribeToCompletions>['subscribe']>[0],
		handlers: WebSocketHandlers<Parameters<Parameters<InstanceType<typeof SubscribeToCompletions>['subscribe']>[1]['onMessage']>[0]>
	): Promise<WebSocketSubscription> {
		return new SubscribeToCompletions(this).subscribe(params as any, handlers as any);
	}

	public subscribeToActiveContracts(
		params: Parameters<InstanceType<typeof SubscribeToActiveContracts>['subscribe']>[0],
		handlers: WebSocketHandlers<Parameters<Parameters<InstanceType<typeof SubscribeToActiveContracts>['subscribe']>[1]['onMessage']>[0]>
	): Promise<WebSocketSubscription> {
		return new SubscribeToActiveContracts(this).subscribe(params as any, handlers as any);
	}

	public subscribeToUpdatesFlats(
		params: Parameters<InstanceType<typeof SubscribeToFlats>['subscribe']>[0],
		handlers: WebSocketHandlers<Parameters<Parameters<InstanceType<typeof SubscribeToFlats>['subscribe']>[1]['onMessage']>[0]>
	): Promise<WebSocketSubscription> {
		return new SubscribeToFlats(this).subscribe(params as any, handlers as any);
	}

	public subscribeToUpdatesTrees(
		params: Parameters<InstanceType<typeof SubscribeToTrees>['subscribe']>[0],
		handlers: WebSocketHandlers<Parameters<Parameters<InstanceType<typeof SubscribeToTrees>['subscribe']>[1]['onMessage']>[0]>
	): Promise<WebSocketSubscription> {
		return new SubscribeToTrees(this).subscribe(params as any, handlers as any);
	}
} 