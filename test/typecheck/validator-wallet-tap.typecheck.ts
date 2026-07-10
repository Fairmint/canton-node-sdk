import type { ValidatorApiClient } from '../../src/clients/validator-api';

type TapRequest = Parameters<ValidatorApiClient['tap']>[0];
type TapResponse = Awaited<ReturnType<ValidatorApiClient['tap']>>;

const requestWithCommandId: TapRequest = {
  amount: '10.5',
  command_id: 'tap-command-123',
};
const requestWithoutCommandId: TapRequest = { amount: '1' };
const response: TapResponse = { contract_id: 'tap-contract-123' };

// @ts-expect-error Tap amounts use the generated decimal-string wire format.
const numericAmount: TapRequest = { amount: 10 };

// @ts-expect-error The generated tap request requires an amount.
const missingAmount: TapRequest = { command_id: 'tap-command-123' };

// @ts-expect-error The generated tap response requires its created contract id.
const missingContractId: TapResponse = {};

void requestWithCommandId;
void requestWithoutCommandId;
void response;
void numericAmount;
void missingAmount;
void missingContractId;
