import type { GetConnectedSynchronizersParams } from '../../../src/clients/ledger-json-api/schemas/operations/state';
import type { GetConnectedSynchronizersResponse } from '../../../src/clients/ledger-json-api/schemas/api/state';
import type { GetDsoPartyIdResponse } from '../../../src/clients/validator-api/schemas/api/scan-proxy';
import { testClients } from '../../setup';

describe('LocalNet Operations (Happy Paths)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the inputs & outputs for getConnectedSynchronizers', async () => {
    const params: GetConnectedSynchronizersParams = {
      party: 'app_provider_quickstart-circleci-1::1220349240f3f941ea497e05c40ae2497f1f2684706c0212e8cba854510332676ed6',
      participantId: 'participant::app-provider',
    };

    const mockResponse: GetConnectedSynchronizersResponse = {
      connectedSynchronizers: [
        {
          synchronizerAlias: 'primary-sync',
          synchronizerId: 'synchronizer::default',
          permission: 'participant-admin',
        },
      ],
    };

    const ledgerApiUrl = testClients.ledgerJsonApi.getApiUrl();
    const getRequestSpy = jest
      .spyOn(testClients.ledgerJsonApi, 'makeGetRequest')
      .mockResolvedValue(mockResponse);

    const response = await testClients.ledgerJsonApi.getConnectedSynchronizers(params);

    const participantQuery = params.participantId ? `&participantId=${encodeURIComponent(params.participantId)}` : '';
    const expectedUrl = `${ledgerApiUrl}/v2/state/connected-synchronizers?party=${encodeURIComponent(
      params.party
    )}${participantQuery}`;

    expect(getRequestSpy).toHaveBeenCalledWith(expectedUrl, {
      contentType: 'application/json',
      includeBearerToken: true,
    });
    expect(response).toEqual(mockResponse);
  });

  it('shows the inputs & outputs for getDsoPartyId', async () => {
    const mockResponse: GetDsoPartyIdResponse = {
      dso_party_id: 'dso_quickstart-circleci-1::1220349240f3f941ea497e05c40ae2497f1f2684706c0212e8cba854510332676ed6',
    };

    const validatorApiUrl = testClients.validatorApi.getApiUrl();
    const getRequestSpy = jest
      .spyOn(testClients.validatorApi, 'makeGetRequest')
      .mockResolvedValue(mockResponse);

    const response = await testClients.validatorApi.getDsoPartyId();

    expect(getRequestSpy).toHaveBeenCalledWith(
      `${validatorApiUrl}/api/validator/v0/scan-proxy/dso-party-id`,
      {
        contentType: 'application/json',
        includeBearerToken: true,
      }
    );
    expect(response).toEqual(mockResponse);
  });
});
