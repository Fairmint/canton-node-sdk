import { testClients } from '../../setup';

type ConnectedSynchronizersResponse = Awaited<
  ReturnType<typeof testClients.ledgerJsonApi.getConnectedSynchronizers>
>;

type WalletBalanceResponse = Awaited<ReturnType<typeof testClients.validatorApi.getWalletBalance>>;

describe('LocalNet Happy Path Operations', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getConnectedSynchronizers returns the synchronizer metadata for a party', async () => {
    const mockResponse: ConnectedSynchronizersResponse = {
      connectedSynchronizers: [
        {
          synchronizerAlias: 'localnet-primary',
          synchronizerId: 'global::122041068e66805bb07d7468f314076fc5ffef76bb8b2bf29af83c23f88ceb0829c1',
          permission: 'PARTICIPANT_PERMISSION_SUBMISSION',
        },
      ],
    };

    const makeGetRequestSpy = jest
      .spyOn(testClients.ledgerJsonApi, 'makeGetRequest')
      .mockResolvedValue(mockResponse);

    const response = await testClients.ledgerJsonApi.getConnectedSynchronizers({
      party: 'Alice::1220',
    });

    expect(makeGetRequestSpy).toHaveBeenCalledWith(
      'http://localhost:3975/v2/state/connected-synchronizers?party=Alice%3A%3A1220',
      expect.objectContaining({ includeBearerToken: true })
    );
    expect(response).toEqual(mockResponse);
  });

  it('getWalletBalance returns the unlocked and locked quantities', async () => {
    const mockResponse: WalletBalanceResponse = {
      round: 42,
      effective_unlocked_qty: '250.000000',
      effective_locked_qty: '750.000000',
      total_holding_fees: '0.000000',
    };

    const makeGetRequestSpy = jest
      .spyOn(testClients.validatorApi, 'makeGetRequest')
      .mockResolvedValue(mockResponse);

    const response = await testClients.validatorApi.getWalletBalance();

    expect(makeGetRequestSpy).toHaveBeenCalledWith(
      'http://localhost:3903/api/validator/v0/wallet/balance',
      expect.objectContaining({ includeBearerToken: true })
    );
    expect(response).toEqual(mockResponse);
  });
});
