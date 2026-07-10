import {
  createOperationHttpRequestOptions,
  snapshotOperationExecuteOptions,
  type BaseClient,
  type OperationExecuteOptions,
} from '../../../../../core';
import { awaitWithAbort } from '../../../../../core/http/abort';
import { ApiOperation } from '../../../../../core/operations/ApiOperation';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { getCurrentMiningRoundDomainId, type MiningRoundClient } from '../../../../../utils/mining/mining-rounds';
import { GetMemberTrafficStatusParamsSchema, type GetMemberTrafficStatusParams } from '../../../schemas/operations';

/** Response type for getMemberTrafficStatus operation */
type GetMemberTrafficStatusResponse =
  operations['getMemberTrafficStatus']['responses']['200']['content']['application/json'];

/** Type guard to check if a client has mining round methods */
function hasMiningRoundMethods(client: BaseClient): client is BaseClient & MiningRoundClient {
  return (
    'getOpenAndIssuingMiningRounds' in client &&
    typeof (client as MiningRoundClient).getOpenAndIssuingMiningRounds === 'function'
  );
}

/**
 * Get a member's traffic status as reported by the sequencer
 *
 * @example
 *   ```typescript
 *   // Get traffic status for current party in current mining round domain
 *   const status = await client.getMemberTrafficStatus();
 *
 *   // Get traffic status for specific member in current mining round domain
 *   const status = await client.getMemberTrafficStatus({
 *   memberId: 'PAR::id::fingerprint'
 *   });
 *
 *   // Get traffic status for specific member in specific domain
 *   const status = await client.getMemberTrafficStatus({
 *   domainId: 'domain123',
 *   memberId: 'PAR::id::fingerprint'
 *   });
 *
 *
 *   ```;
 */
export class GetMemberTrafficStatus extends ApiOperation<GetMemberTrafficStatusParams, GetMemberTrafficStatusResponse> {
  public async execute(
    params: GetMemberTrafficStatusParams = {},
    options?: OperationExecuteOptions<GetMemberTrafficStatusParams>
  ): Promise<GetMemberTrafficStatusResponse> {
    const operationOptions = snapshotOperationExecuteOptions(options);
    const validatedParams = this.validateParams(params, GetMemberTrafficStatusParamsSchema);
    const discoveryOptions: OperationExecuteOptions<void> | undefined =
      operationOptions === undefined
        ? undefined
        : Object.freeze({
            ...(operationOptions.signal !== undefined ? { signal: operationOptions.signal } : {}),
            // Discovery is a separate semantic read. Honor an explicit retry disable; hooks whose params describe the
            // traffic-status request remain scoped to that final request.
            ...(operationOptions.retry?.kind === 'none' ? { retry: Object.freeze({ kind: 'none' as const }) } : {}),
          });
    const buildUrl = async (attemptParams: GetMemberTrafficStatusParams): Promise<string> => {
      const validatedAttemptParams = this.validateParams(attemptParams, GetMemberTrafficStatusParamsSchema);

      // Auto-determine domainId if not provided
      let { domainId } = validatedAttemptParams;
      if (!domainId) {
        if (!hasMiningRoundMethods(this.client)) {
          throw new Error('Client does not support getOpenAndIssuingMiningRounds - use ValidatorApiClient');
        }
        const miningRoundClient = this.client;
        domainId = await awaitWithAbort(
          async (): Promise<string> => getCurrentMiningRoundDomainId(miningRoundClient, discoveryOptions),
          operationOptions?.signal
        );
      }

      // Auto-determine memberId if not provided
      const memberId = validatedAttemptParams.memberId ?? this.client.getPartyId();

      return `${this.getApiUrl()}/api/validator/v0/scan-proxy/domains/${encodeURIComponent(domainId)}/members/${encodeURIComponent(memberId)}/traffic-status`;
    };

    const url = await buildUrl(validatedParams);
    const httpOptions =
      operationOptions === undefined
        ? undefined
        : createOperationHttpRequestOptions({
            initialParams: validatedParams,
            options: operationOptions,
            requestSemantics: 'read',
            initialUrl: url,
            validateParams: (derivedParams): GetMemberTrafficStatusParams =>
              this.validateParams(derivedParams, GetMemberTrafficStatusParamsSchema),
            buildUrl,
            buildBody: (): undefined => undefined,
          });

    return this.makeGetRequest<GetMemberTrafficStatusResponse>(
      url,
      {
        includeBearerToken: true,
      },
      httpOptions
    );
  }
}
