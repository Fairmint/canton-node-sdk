import { EnvLoader } from '../../../src/core/config/EnvLoader';

describe('EnvLoader', () => {
  beforeEach(() => {
    // Reset the singleton instance before each test
    EnvLoader.resetInstance();

    // Clear environment variables
    delete process.env['CANTON_WALLET_TEMPLATE_ID_MAINNET'];
    delete process.env['CANTON_PREAPPROVAL_TEMPLATE_ID_MAINNET'];
    delete process.env['CANTON_AMULET_RULES_CONTRACT_ID_MAINNET'];
    delete process.env['CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_MAINNET'];
    delete process.env['CANTON_WALLET_TEMPLATE_ID_DEVNET'];
    delete process.env['CANTON_PREAPPROVAL_TEMPLATE_ID_DEVNET'];
    delete process.env['CANTON_AMULET_RULES_CONTRACT_ID_DEVNET'];
    delete process.env['CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_DEVNET'];
    delete process.env['CANTON_CURRENT_NETWORK'];
  });

  describe('getAmuletRulesContractId', () => {
    it('should return amulet rules contract ID for mainnet', () => {
      process.env['CANTON_AMULET_RULES_CONTRACT_ID_MAINNET'] = 'test-amulet-rules-contract-mainnet';
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';

      const envLoader = EnvLoader.getInstance();
      const result = envLoader.getAmuletRulesContractId();

      expect(result).toBe('test-amulet-rules-contract-mainnet');
    });

    it('should return amulet rules contract ID for devnet', () => {
      process.env['CANTON_AMULET_RULES_CONTRACT_ID_DEVNET'] = 'test-amulet-rules-contract-devnet';
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
      }).toThrow('Missing required environment variable: CANTON_AMULET_RULES_CONTRACT_ID_MAINNET');
    });
  });

  describe('getValidatorWalletAppInstallContractId', () => {
    it('should return validator wallet app install contract ID for mainnet', () => {
      process.env['CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_MAINNET'] =
        'test-validator-wallet-app-install-contract-mainnet';
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';

      const envLoader = EnvLoader.getInstance();
      const result = envLoader.getValidatorWalletAppInstallContractId();

      expect(result).toBe('test-validator-wallet-app-install-contract-mainnet');
    });

    it('should return validator wallet app install contract ID for devnet', () => {
      process.env['CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_DEVNET'] =
        'test-validator-wallet-app-install-contract-devnet';
      process.env['CANTON_CURRENT_NETWORK'] = 'devnet';

      const envLoader = EnvLoader.getInstance();
      const result = envLoader.getValidatorWalletAppInstallContractId();

      expect(result).toBe('test-validator-wallet-app-install-contract-devnet');
    });

    it('should throw error when contract ID is missing', () => {
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';

      const envLoader = EnvLoader.getInstance();

      expect(() => {
        envLoader.getValidatorWalletAppInstallContractId();
      }).toThrow('Missing required environment variable: CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_MAINNET');
    });
  });

  describe('getConfigSummary includes template and contract IDs', () => {
    it('should include template and contract IDs in config summary', () => {
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';
      process.env['CANTON_CURRENT_PROVIDER'] = '5n';
      process.env['CANTON_WALLET_TEMPLATE_ID_MAINNET'] = 'test-wallet-template';
      process.env['CANTON_PREAPPROVAL_TEMPLATE_ID_MAINNET'] = 'test-preapproval-template';
      process.env['CANTON_AMULET_RULES_CONTRACT_ID_MAINNET'] = 'test-amulet-rules-contract';
      process.env['CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_MAINNET'] =
        'test-validator-wallet-app-install-contract';
      process.env['CANTON_MAINNET_5N_VALIDATOR_API_URI'] = 'https://validator.example';
      process.env['CANTON_MAINNET_5N_VALIDATOR_API_CLIENT_ID'] = 'validator-client';
      process.env['CANTON_MAINNET_5N_AUTH_URL'] = 'https://auth.example';

      const summary = EnvLoader.getConfigSummary('VALIDATOR_API');

      expect(summary.envVars['CANTON_WALLET_TEMPLATE_ID_MAINNET']).toBe('test-wallet-template');
      expect(summary.envVars['CANTON_PREAPPROVAL_TEMPLATE_ID_MAINNET']).toBe('test-preapproval-template');
      expect(summary.envVars['CANTON_AMULET_RULES_CONTRACT_ID_MAINNET']).toBe('test-amulet-rules-contract');
      expect(summary.envVars['CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_MAINNET']).toBe(
        'test-validator-wallet-app-install-contract'
      );
      expect(summary.missingVars).toHaveLength(0);
    });

    it('should detect missing template and contract IDs', () => {
      process.env['CANTON_CURRENT_NETWORK'] = 'mainnet';

      const summary = EnvLoader.getConfigSummary('VALIDATOR_API');

      expect(summary.missingVars).toContain('CANTON_WALLET_TEMPLATE_ID_MAINNET');
      expect(summary.missingVars).toContain('CANTON_PREAPPROVAL_TEMPLATE_ID_MAINNET');
      expect(summary.missingVars).toContain('CANTON_AMULET_RULES_CONTRACT_ID_MAINNET');
      expect(summary.missingVars).toContain('CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_MAINNET');
    });
  });
});
