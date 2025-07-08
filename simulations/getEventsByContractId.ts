import { simulate } from './index';

const contractId =
  '00528fab06fe8694392494a01925bae6cdb94c35c14a8bbffcebca23278521b2e4ca1112200794083bad5ae157d245234eaa24b5dff2a88b1d62caa8c70701fab4ba4f9ba0';

simulate(
  client => client.getEventsByContractId.execute({ contractId }),
  'LedgerJsonApiClient_getEventsByContractId',
  [contractId],
  'EventsByContractIdResponse'
).catch(error => {
  console.error('❌ Simulation failed:', error.message);
  process.exit(1);
});
