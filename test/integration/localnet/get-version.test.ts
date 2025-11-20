import type { GetLedgerApiVersionResponse } from '../../../src/clients/ledger-json-api/schemas/api/state';
import { testClients } from '../../setup';

describe('LocalNet GetVersion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getVersion', async () => {
    const mockResponse: GetLedgerApiVersionResponse = {
      version: '3.3.0-SNAPSHOT',
      features: {
        experimental: {
          staticTime: {
            supported: false,
          },
          commandInspectionService: {
            supported: true,
          },
        },
        userManagement: {
          supported: true,
          maxRightsPerUser: 1000,
          maxUsersPageSize: 1000,
        },
        partyManagement: {
          maxPartiesPageSize: 10000,
        },
        offsetCheckpoint: {
          maxOffsetCheckpointEmissionDelay: {
            seconds: 75,
            nanos: 0,
            unknownFields: {
              fields: {},
            },
          },
        },
      },
    };

    const apiUrl = testClients.ledgerJsonApi.getApiUrl();
    const getRequestSpy = jest
      .spyOn(testClients.ledgerJsonApi, 'makeGetRequest')
      .mockResolvedValue(mockResponse);

    const response = await testClients.ledgerJsonApi.getVersion();

    expect(getRequestSpy).toHaveBeenCalledWith(`${apiUrl}/v2/version`, {
      contentType: 'application/json',
      includeBearerToken: true,
    });
    expect(response).toEqual(mockResponse);
  });
});
