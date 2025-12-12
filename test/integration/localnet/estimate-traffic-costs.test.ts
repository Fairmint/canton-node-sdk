import { randomUUID } from 'node:crypto';

import { testClients } from '../../setup';

describe('LocalNet Interactive Submission traffic cost estimation', () => {
  it('estimates traffic cost for a prepared transaction', async () => {
    // 1) Allocate a fresh party (requires admin privileges, provided by localnet defaults).
    const allocatePartyResp = await testClients.ledgerJsonApi.interactiveSubmissionAllocateParty({
      displayName: `sdk-test-${randomUUID()}`,
      isLocal: true,
    });

    const {
      party: { party },
    } = allocatePartyResp;

    // 2) Pick a synchronizer ID (required by the prepare endpoint in this SDK).
    const connected = await testClients.ledgerJsonApi.getConnectedSynchronizers({ party });
    const synchronizerId = connected.connectedSynchronizers?.[0]?.synchronizerId;
    if (!synchronizerId) {
      throw new Error('No connected synchronizers found for allocated party');
    }

    // 3) Prepare a minimal transaction (create an IOU contract from the quickstart "model-tests" package).
    // This mirrors the Canton JSON API example (`#model-tests:Iou:Iou`).
    const prepareResp = await testClients.ledgerJsonApi.interactiveSubmissionPrepare({
      commands: [
        {
          CreateCommand: {
            templateId: '#model-tests:Iou:Iou',
            createArguments: {
              issuer: party,
              owner: party,
              currency: 'USD',
              amount: '1.00',
              observers: [],
            },
          },
        },
      ],
      commandId: `sdk-test-estimate-traffic-${randomUUID()}`,
      userId: 'ledger-api-user',
      actAs: [party],
      readAs: [party],
      synchronizerId,
      verboseHashing: false,
      packageIdSelectionPreference: [],
    });

    if (!prepareResp.preparedTransaction) {
      throw new Error('Prepare response did not include preparedTransaction');
    }

    // 4) Estimate traffic cost for the prepared transaction.
    const estimate = await testClients.ledgerJsonApi.interactiveSubmissionEstimateTrafficCosts({
      preparedTransaction: prepareResp.preparedTransaction,
      hashingSchemeVersion: prepareResp.hashingSchemeVersion,
      userId: 'ledger-api-user',
    });

    // Log the full response so we can lock down exact expectations (and understand units) in CI output.
    console.log('interactiveSubmissionEstimateTrafficCosts:', JSON.stringify(estimate));

    // Replace this value with the number printed above (CI log output) once confirmed.
    expect(estimate).toEqual({ trafficCost: 0 });
  });
});

