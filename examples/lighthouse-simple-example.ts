import { ClientFactory } from '../src';
import { EnvLoader } from '../src';
import { LighthouseApiClient, GetTransferAgentResponse } from '../src/clients/lighthouse-api';

async function lighthouseSimpleExample() {
  try {
    // Method 1: Using EnvLoader with simplified environment variables
    console.log('Method 1: Using EnvLoader...');
    const config = EnvLoader.getConfig('LIGHTHOUSE_API');
    const client = ClientFactory.createClient('LIGHTHOUSE_API', config) as LighthouseApiClient;
    
    const response: GetTransferAgentResponse = await client.getTransferAgent({
      partyId: 'TransferAgent-devnet-1::1220ea70ea2cbfe6be431f34c7323e249c624a02fb2209d2b73fabd7eea1fe84df34'
    });
    console.log(`Balance: ${response.balance.total_cc} ${response.balance.currency}`);
    console.log(`Traffic Usage: ${response.traffic_status.usage_percent.toFixed(2)}%`);
    console.log(`Validator Version: ${response.validator.version}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the example
lighthouseSimpleExample().catch(console.error); 