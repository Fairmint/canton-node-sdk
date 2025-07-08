import { simulate } from './core';

const contractId =
  '00528fab06fe8694392494a01925bae6cdb94c35c14a8bbffcebca23278521b2e4ca1112200794083bad5ae157d245234eaa24b5dff2a88b1d62caa8c70701fab4ba4f9ba0';

simulate(
  client => client.getEventsByContractId.execute({ contractId }),
  'LedgerJsonApiClient_getEventsByContractId',
  'EventsByContractIdResponse'
);

simulate(
  client =>
    client.getEventsByContractId.execute({ contractId: contractId + '1' }),
  'LedgerJsonApiClient_invalid_field',
  'EventsByContractIdResponse'
);

simulate(
  client =>
    client.getEventsByContractId.execute({ contractId: 'a' + contractId.substring(1) }),
  'LedgerJsonApiClient_cid_not_found',
  'EventsByContractIdResponse'
);
