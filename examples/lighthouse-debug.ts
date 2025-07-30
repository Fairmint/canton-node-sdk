import { ClientFactory } from '../src';
import { EnvLoader } from '../src';
import { LighthouseApiClient } from '../src/clients/lighthouse-api';

async function lighthouseDebug() {
  try {
    console.log('Environment variables:');
    console.log('CANTON_CURRENT_NETWORK:', process.env.CANTON_CURRENT_NETWORK);
    console.log('CANTON_MAINNET_LIGHTHOUSE_API_URI:', process.env.CANTON_MAINNET_LIGHTHOUSE_API_URI);
    console.log('CANTON_DEVNET_LIGHTHOUSE_API_URI:', process.env.CANTON_DEVNET_LIGHTHOUSE_API_URI);
    console.log('CANTON_DEVNET_LIGHTHOUSE_API_PARTY_ID:', process.env.CANTON_DEVNET_LIGHTHOUSE_API_PARTY_ID);
    console.log('CANTON_MAINNET_LIGHTHOUSE_API_PARTY_ID:', process.env.CANTON_MAINNET_LIGHTHOUSE_API_PARTY_ID);
    
    console.log('\nMethod 1: Using EnvLoader...');
    const config = EnvLoader.getConfig('LIGHTHOUSE_API');
    console.log('Config:', JSON.stringify(config, null, 2));
    
    const client = ClientFactory.createClient('LIGHTHOUSE_API', config) as LighthouseApiClient;
    console.log('API URL:', client.getApiUrl());
    console.log('Party ID:', client.getPartyId());
    
    // Test the URL construction
    const testUrl = `${client.getApiUrl()}/validators/${encodeURIComponent(client.getPartyId())}`;
    console.log('Constructed URL:', testUrl);
    
    // Try the request
    try {
      const response = await client.getTransferAgent({
        partyId: 'TransferAgent-mainnet-1::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7'
      });
      console.log('Response:', response);
    } catch (error) {
      console.log('Method 1 failed:', error.message);
    }

    console.log('\nMethod 2: Direct configuration with party ID...');
    const directClient = ClientFactory.createClient('LIGHTHOUSE_API', {
      network: 'mainnet',
      apis: {
        LIGHTHOUSE_API: {
          apiUrl: 'https://lighthouse.fivenorth.io/api',
        },
      },
    }) as LighthouseApiClient;
    
    console.log('Direct API URL:', directClient.getApiUrl());
    
    const directResponse = await directClient.getTransferAgent({
      partyId: 'TransferAgent-mainnet-1::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7'
    });
    console.log('Direct Response:', directResponse);

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the debug example
lighthouseDebug().catch(console.error); 