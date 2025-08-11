import { EnvLoader } from '../src/core/config/EnvLoader';

describe('EnvLoader', () => {
  beforeEach(() => {
    // Reset the singleton instance before each test
    EnvLoader.resetInstance();
    
    // Clear environment variables
    delete process.env['WALLET_TEMPLATE_ID_MAINNET'];
    delete process.env['PREAPPROVAL_TEMPLATE_ID_MAINNET'];
    delete process.env['AMULET_RULES_CONTRACT_ID_MAINNET'];
    delete process.env['WALLET_TEMPLATE_ID_DEVNET'];
    delete process.env['PREAPPROVAL_TEMPLATE_ID_DEVNET'];
    delete process.env['AMULET_RULES_CONTRACT_ID_DEVNET'];
    delete process.env['CANTON_CURRENT_NETWORK'];
  });

  describe('getWalletTemplateId', () => {
    it('should return wallet template ID for mainnet', () => {
      process.env['WALLET_TEMPLATE_ID_MAINNET'] = 'test-wallet-template-mainnet';
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';
      
      const envLoader = EnvLoader.getInstance();
      const result = envLoader.getWalletTemplateId();
      
      expect(result).toBe('test-wallet-template-mainnet');
    });

    it('should return wallet template ID for devnet', () => {
      process.env['WALLET_TEMPLATE_ID_DEVNET'] = 'test-wallet-template-devnet';
      process.env['CANTON_CURRENT_NETWORK'] = 'devnet';
      
      const envLoader = EnvLoader.getInstance();
      const result = envLoader.getWalletTemplateId();
      
      expect(result).toBe('test-wallet-template-devnet');
    });

    it('should accept network parameter override', () => {
      process.env['WALLET_TEMPLATE_ID_MAINNET'] = 'test-wallet-template-mainnet';
      process.env['WALLET_TEMPLATE_ID_DEVNET'] = 'test-wallet-template-devnet';
      process.env['CANTON_CURRENT_NETWORK'] = 'devnet';
      
      const envLoader = EnvLoader.getInstance();
      const result = envLoader.getWalletTemplateId('mainnet');
      
      expect(result).toBe('test-wallet-template-mainnet');
    });

    it('should throw error when template ID is missing', () => {
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';
      
      const envLoader = EnvLoader.getInstance();
      
      expect(() => {
        envLoader.getWalletTemplateId();
      }).toThrow('Missing required environment variable: WALLET_TEMPLATE_ID_MAINNET');
    });
  });

  describe('getPreapprovalTemplateId', () => {
    it('should return preapproval template ID for mainnet', () => {
      process.env['PREAPPROVAL_TEMPLATE_ID_MAINNET'] = 'test-preapproval-template-mainnet';
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';
      
      const envLoader = EnvLoader.getInstance();
      const result = envLoader.getPreapprovalTemplateId();
      
      expect(result).toBe('test-preapproval-template-mainnet');
    });

    it('should return preapproval template ID for devnet', () => {
      process.env['PREAPPROVAL_TEMPLATE_ID_DEVNET'] = 'test-preapproval-template-devnet';
      process.env['CANTON_CURRENT_NETWORK'] = 'devnet';
      
      const envLoader = EnvLoader.getInstance();
      const result = envLoader.getPreapprovalTemplateId();
      
      expect(result).toBe('test-preapproval-template-devnet');
    });

    it('should throw error when template ID is missing', () => {
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';
      
      const envLoader = EnvLoader.getInstance();
      
      expect(() => {
        envLoader.getPreapprovalTemplateId();
      }).toThrow('Missing required environment variable: PREAPPROVAL_TEMPLATE_ID_MAINNET');
    });
  });

  describe('getAmuletRulesContractId', () => {
    it('should return amulet rules contract ID for mainnet', () => {
      process.env['AMULET_RULES_CONTRACT_ID_MAINNET'] = 'test-amulet-rules-contract-mainnet';
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';
      
      const envLoader = EnvLoader.getInstance();
      const result = envLoader.getAmuletRulesContractId();
      
      expect(result).toBe('test-amulet-rules-contract-mainnet');
    });

    it('should return amulet rules contract ID for devnet', () => {
      process.env['AMULET_RULES_CONTRACT_ID_DEVNET'] = 'test-amulet-rules-contract-devnet';
      process.env['CANTON_CURRENT_NETWORK'] = 'devnet';
      
      const envLoader = EnvLoader.getInstance();
      const result = envLoader.getAmuletRulesContractId();
      
      expect(result).toBe('test-amulet-rules-contract-devnet');
    });

    it('should throw error when contract ID is missing', () => {
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';
      
      const envLoader = EnvLoader.getInstance();
      
      expect(() => {
        envLoader.getAmuletRulesContractId();
      }).toThrow('Missing required environment variable: AMULET_RULES_CONTRACT_ID_MAINNET');
    });
  });

  describe('getConfigSummary includes template and contract IDs', () => {
    it('should include template and contract IDs in config summary', () => {
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';
      process.env['WALLET_TEMPLATE_ID_MAINNET'] = 'test-wallet-template';
      process.env['PREAPPROVAL_TEMPLATE_ID_MAINNET'] = 'test-preapproval-template';
      process.env['AMULET_RULES_CONTRACT_ID_MAINNET'] = 'test-amulet-rules-contract';
      
      const summary = EnvLoader.getConfigSummary('LIGHTHOUSE_API');
      
      expect(summary.envVars['WALLET_TEMPLATE_ID_MAINNET']).toBe('test-wallet-template');
      expect(summary.envVars['PREAPPROVAL_TEMPLATE_ID_MAINNET']).toBe('test-preapproval-template');
      expect(summary.envVars['AMULET_RULES_CONTRACT_ID_MAINNET']).toBe('test-amulet-rules-contract');
      expect(summary.missingVars).toHaveLength(0);
    });

    it('should detect missing template and contract IDs', () => {
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';
      
      const summary = EnvLoader.getConfigSummary('LIGHTHOUSE_API');
      
      expect(summary.missingVars).toContain('WALLET_TEMPLATE_ID_MAINNET');
      expect(summary.missingVars).toContain('PREAPPROVAL_TEMPLATE_ID_MAINNET');
      expect(summary.missingVars).toContain('AMULET_RULES_CONTRACT_ID_MAINNET');
    });
  });
}); 