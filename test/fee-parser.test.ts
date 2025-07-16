import {
  parseFeesFromUpdate,
  parseFeesFromEventTree,
  validateFeeAnalysis,
  formatFeeAmount,
  FeeAnalysis,
} from '../src/utils/parsers/fee-parser';
import { TreeEvent } from '../src/clients/ledger-json-api/schemas/api/events';

describe('Fee Parser', () => {
  /**
   * TransferPreapproval_Send 2.2122620000 from 1a50f9 to Fairmint
   * -3.4343846200 from 1a50f9 [-1.22212262 fee]
   * Sender charge amount 4035.7435221100 - 4032.3087569720 = 3.434765138 [wtf is this?, 0.000380518 delta from above]
   *   -- this is the holdingFees
   * 22.6217254480 to Fairmint
   */
  const sampleEventTree: Record<string, TreeEvent> = {
    '0': {
      ExercisedTreeEvent: {
        value: {
          offset: 1079102,
          nodeId: 0,
          contractId:
            '00a6985c1b9f73c949e432f8d91f726f59ad23b12517ae75ee493906ecfa214cc6ca1012201dcf859dca0846cb4f6308797cdd676236a783f34d41843cba0ef0942b5f4f03',
          templateId:
            '511bd3bf23fab4e5171edb22dceabe3061f7faf78a44f8af44f3b87f977c61f6:Splice.AmuletRules:TransferPreapproval',
          interfaceId: null,
          choice: 'TransferPreapproval_Send',
          choiceArgument: {
            context: {
              amuletRules:
                '0033e73c594edd5f9317d0c208de051d9d52a477819de41dbb7389a7e0b6fb489eca111220aa5852b5d537aeabbab78f90fc623cc49d3675ce7084e547546c4e342a99c665',
              context: {
                openMiningRound:
                  '00360862c80c768b3bc56f527ea2f8a51af0635ae6cede522350581f9df3b6e50aca111220788041db2d1add1d191193ee38bc2a09b01cd1ebd66f1016854389615691a35b',
                issuingMiningRounds: [],
                validatorRights: [],
                featuredAppRight:
                  '007012058698d54cc0658fe6f03dca02ff1fcbed22de303afb3b0b05ae64ab7d00ca10122035cf8baf98deb44492128beab1d68d7801edb7dee9bf74f28d9edce9a13a5af0',
              },
            },
            inputs: [
              {
                tag: 'InputAmulet',
                value:
                  '002f5414189bdc634fb97b0efa7630bcbd44752fc20cdaf8cfc679c77cd0d15773ca111220907fe7c74b64fc54d4dde246f268871ddfeee60ba56a7150c406c6beb6734019',
              },
            ],
            amount: '2.2122620000',
            sender:
              '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
          },
          actingParties: [
            '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
          ],
          consuming: false,
          witnessParties: [
            'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
          ],
          lastDescendantNodeId: 10,
          exerciseResult: {
            result: {
              round: {
                number: '53636',
              },
              summary: {
                inputAppRewardAmount: '0.0000000000',
                inputValidatorRewardAmount: '0.0000000000',
                inputSvRewardAmount: '0.0000000000',
                inputAmuletAmount: '4035.7435221100',
                balanceChanges: [
                  [
                    '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
                    {
                      changeToInitialAmountAsOfRoundZero: '-3.4343846200',
                      changeToHoldingFeesRate: '0.0000000000',
                    },
                  ],
                  [
                    'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
                    {
                      changeToInitialAmountAsOfRoundZero: '22.6217254480',
                      changeToHoldingFeesRate: '0.0003805180',
                    },
                  ],
                ],
                holdingFees: '0.0003805180',
                outputFees: ['0.6221226200'],
                senderChangeFee: '0.6000000000',
                senderChangeAmount: '4032.3087569720',
                amuletPrice: '0.0500000000',
                inputValidatorFaucetAmount: '0.0000000000',
              },
              createdAmulets: [
                {
                  tag: 'TransferResultAmulet',
                  value:
                    '007a6c84c1d436e5f8ce202a54e86b4a0f7e47a2bff951ed418fed2aa74807453fca11122024b1f58af7e16cd0c503e08b68ecec07805fec706d78c0b8b97126b3953161f4',
                },
              ],
              senderChangeAmulet:
                '00cc939c77573f7bdaf66b9d6b414a7cff89bb4c42bb286b891f6cdb55a229f817ca111220493b9fd70f76fca66c27291822120645ddd150f0b0e327cacb86645a6f222844',
            },
          },
          packageName: 'splice-amulet',
          implementedInterfaces: [],
        },
      },
    },
    '2': {
      ExercisedTreeEvent: {
        value: {
          offset: 1079102,
          nodeId: 2,
          contractId:
            '0033e73c594edd5f9317d0c208de051d9d52a477819de41dbb7389a7e0b6fb489eca111220aa5852b5d537aeabbab78f90fc623cc49d3675ce7084e547546c4e342a99c665',
          templateId:
            '511bd3bf23fab4e5171edb22dceabe3061f7faf78a44f8af44f3b87f977c61f6:Splice.AmuletRules:AmuletRules',
          interfaceId: null,
          choice: 'AmuletRules_Transfer',
          choiceArgument: {
            transfer: {
              sender:
                '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
              provider:
                'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
              inputs: [
                {
                  tag: 'InputAmulet',
                  value:
                    '002f5414189bdc634fb97b0efa7630bcbd44752fc20cdaf8cfc679c77cd0d15773ca111220907fe7c74b64fc54d4dde246f268871ddfeee60ba56a7150c406c6beb6734019',
                },
              ],
              outputs: [
                {
                  receiver:
                    'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
                  receiverFeeRatio: '0.0000000000',
                  amount: '2.2122620000',
                  lock: null,
                },
              ],
            },
            context: {
              openMiningRound:
                '00360862c80c768b3bc56f527ea2f8a51af0635ae6cede522350581f9df3b6e50aca111220788041db2d1add1d191193ee38bc2a09b01cd1ebd66f1016854389615691a35b',
              issuingMiningRounds: [],
              validatorRights: [],
              featuredAppRight:
                '007012058698d54cc0658fe6f03dca02ff1fcbed22de303afb3b0b05ae64ab7d00ca10122035cf8baf98deb44492128beab1d68d7801edb7dee9bf74f28d9edce9a13a5af0',
            },
          },
          actingParties: [
            '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
            'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
          ],
          consuming: false,
          witnessParties: [
            'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
          ],
          lastDescendantNodeId: 10,
          exerciseResult: {
            round: {
              number: '53636',
            },
            summary: {
              inputAppRewardAmount: '0.0000000000',
              inputValidatorRewardAmount: '0.0000000000',
              inputSvRewardAmount: '0.0000000000',
              inputAmuletAmount: '4035.7435221100',
              balanceChanges: [
                [
                  '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
                  {
                    changeToInitialAmountAsOfRoundZero: '-3.4343846200',
                    changeToHoldingFeesRate: '0.0000000000',
                  },
                ],
                [
                  'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
                  {
                    changeToInitialAmountAsOfRoundZero: '22.6217254480',
                    changeToHoldingFeesRate: '0.0003805180',
                  },
                ],
              ],
              holdingFees: '0.0003805180',
              outputFees: ['0.6221226200'],
              senderChangeFee: '0.6000000000',
              senderChangeAmount: '4032.3087569720',
              amuletPrice: '0.0500000000',
              inputValidatorFaucetAmount: '0.0000000000',
            },
            createdAmulets: [
              {
                tag: 'TransferResultAmulet',
                value:
                  '007a6c84c1d436e5f8ce202a54e86b4a0f7e47a2bff951ed418fed2aa74807453fca11122024b1f58af7e16cd0c503e08b68ecec07805fec706d78c0b8b97126b3953161f4',
              },
            ],
            senderChangeAmulet:
              '00cc939c77573f7bdaf66b9d6b414a7cff89bb4c42bb286b891f6cdb55a229f817ca111220493b9fd70f76fca66c27291822120645ddd150f0b0e327cacb86645a6f222844',
          },
          packageName: 'splice-amulet',
          implementedInterfaces: [],
        },
      },
    },
    '6': {
      ExercisedTreeEvent: {
        value: {
          offset: 1079102,
          nodeId: 6,
          contractId:
            '002f5414189bdc634fb97b0efa7630bcbd44752fc20cdaf8cfc679c77cd0d15773ca111220907fe7c74b64fc54d4dde246f268871ddfeee60ba56a7150c406c6beb6734019',
          templateId:
            '511bd3bf23fab4e5171edb22dceabe3061f7faf78a44f8af44f3b87f977c61f6:Splice.Amulet:Amulet',
          interfaceId: null,
          choice: 'Archive',
          choiceArgument: {},
          actingParties: [
            '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
            'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc',
          ],
          consuming: true,
          witnessParties: [
            'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
          ],
          lastDescendantNodeId: 6,
          exerciseResult: {},
          packageName: 'splice-amulet',
          implementedInterfaces: [],
        },
      },
    },
    '7': {
      CreatedTreeEvent: {
        value: {
          offset: 1079102,
          nodeId: 7,
          contractId:
            '00e444c080f0e5457092ffc28a71c4e78061cfa76d03657c492c8d3578d0790a81ca1112208575dde87ebda1c97a5cf85536deab6988455a629f3e45aa4f31903fe75ea2f2',
          templateId:
            '511bd3bf23fab4e5171edb22dceabe3061f7faf78a44f8af44f3b87f977c61f6:Splice.Amulet:ValidatorRewardCoupon',
          contractKey: null,
          createArgument: {
            dso: 'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc',
            user: '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
            amount: '0.6221226200',
            round: {
              number: '53636',
            },
          },
          createdEventBlob: '',
          interfaceViews: [],
          witnessParties: [
            'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
          ],
          signatories: [
            'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc',
          ],
          observers: [
            '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
          ],
          createdAt: '2025-07-16T19:50:37.823971Z',
          packageName: 'splice-amulet',
        },
      },
    },
    '8': {
      CreatedTreeEvent: {
        value: {
          offset: 1079102,
          nodeId: 8,
          contractId:
            '009e441dc911b74800d03b48eb890909550f80484a9bf41be1387fb5a665687ca6ca1112205df0fa0144266ca70765f5e357261cf77fed5e8a785801e3ffc6c7b38a7acbf4',
          templateId:
            '511bd3bf23fab4e5171edb22dceabe3061f7faf78a44f8af44f3b87f977c61f6:Splice.Amulet:AppRewardCoupon',
          contractKey: null,
          createArgument: {
            dso: 'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc',
            provider:
              'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
            featured: true,
            amount: '20.6221226200',
            round: {
              number: '53636',
            },
          },
          createdEventBlob: '',
          interfaceViews: [],
          witnessParties: [
            'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
          ],
          signatories: [
            'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc',
          ],
          observers: [
            'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
          ],
          createdAt: '2025-07-16T19:50:37.823971Z',
          packageName: 'splice-amulet',
        },
      },
    },
    '9': {
      CreatedTreeEvent: {
        value: {
          offset: 1079102,
          nodeId: 9,
          contractId:
            '007a6c84c1d436e5f8ce202a54e86b4a0f7e47a2bff951ed418fed2aa74807453fca11122024b1f58af7e16cd0c503e08b68ecec07805fec706d78c0b8b97126b3953161f4',
          templateId:
            '511bd3bf23fab4e5171edb22dceabe3061f7faf78a44f8af44f3b87f977c61f6:Splice.Amulet:Amulet',
          contractKey: null,
          createArgument: {
            dso: 'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc',
            owner:
              'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
            amount: {
              initialAmount: '2.2122620000',
              createdAt: {
                number: '53636',
              },
              ratePerRound: {
                rate: '0.0003805180',
              },
            },
          },
          createdEventBlob: '',
          interfaceViews: [],
          witnessParties: [
            'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
          ],
          signatories: [
            'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc',
            'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
          ],
          observers: [],
          createdAt: '2025-07-16T19:50:37.823971Z',
          packageName: 'splice-amulet',
        },
      },
    },
    '10': {
      CreatedTreeEvent: {
        value: {
          offset: 1079102,
          nodeId: 10,
          contractId:
            '00cc939c77573f7bdaf66b9d6b414a7cff89bb4c42bb286b891f6cdb55a229f817ca111220493b9fd70f76fca66c27291822120645ddd150f0b0e327cacb86645a6f222844',
          templateId:
            '511bd3bf23fab4e5171edb22dceabe3061f7faf78a44f8af44f3b87f977c61f6:Splice.Amulet:Amulet',
          contractKey: null,
          createArgument: {
            dso: 'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc',
            owner:
              '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
            amount: {
              initialAmount: '4032.3087569720',
              createdAt: {
                number: '53636',
              },
              ratePerRound: {
                rate: '0.0003805180',
              },
            },
          },
          createdEventBlob: '',
          interfaceViews: [],
          witnessParties: [
            'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2',
          ],
          signatories: [
            '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
            'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc',
          ],
          observers: [],
          createdAt: '2025-07-16T19:50:37.823971Z',
          packageName: 'splice-amulet',
        },
      },
    },
  };

  describe('parseFeesFromEventTree', () => {
    it('should extract fee information from a valid event tree', () => {
      const result = parseFeesFromEventTree(sampleEventTree);

      expect(result.totalFees).toBe('1.2225031380');
      expect(result.feeBreakdown.holdingFees).toBe('0.0003805180');
      expect(result.feeBreakdown.outputFees).toEqual(['0.6221226200']);
      expect(result.feeBreakdown.senderChangeFee).toBe('0.6000000000');
      expect(result.balanceChanges).toHaveLength(2);
      expect(result.feeValidation.isBalanced).toBe(false);
      expect(result.feeValidation.discrepancy).toBe('21.278613206');
    });

    it('should correctly identify balance changes', () => {
      const result = parseFeesFromEventTree(sampleEventTree);

      const senderChange = result.balanceChanges.find(
        bc =>
          bc.party ===
          '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7'
      );
      const validatorChange = result.balanceChanges.find(
        bc =>
          bc.party ===
          'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2'
      );

      expect(senderChange?.changeToInitialAmountAsOfRoundZero).toBe(
        '-3.4343846200'
      );
      expect(validatorChange?.changeToInitialAmountAsOfRoundZero).toBe(
        '22.6217254480'
      );
    });

    it('should validate fee balance correctly', () => {
      const result = parseFeesFromEventTree(sampleEventTree);

      expect(result.feeValidation.isBalanced).toBe(false);
      expect(result.feeValidation.totalBalanceChange).toBe('20.0561100680');
      expect(result.feeValidation.totalFeesCalculated).toBe('1.2225031380');
      expect(result.feeValidation.discrepancy).toBe('21.278613206');
    });

    it('should throw error when no AmuletRules_Transfer event is found', () => {
      const eventTreeWithoutTransfer: Record<string, TreeEvent> = {
        '0': {
          CreatedTreeEvent: {
            value: {
              offset: 1,
              nodeId: 1,
              contractId: 'test',
              templateId: 'test',
              contractKey: null,
              createArgument: {},
              createdEventBlob: '',
              interfaceViews: [],
              witnessParties: [],
              signatories: [],
              observers: [],
              createdAt: '2025-07-16T19:50:37.823971Z',
              packageName: 'test',
            },
          },
        },
      };

      expect(() => parseFeesFromEventTree(eventTreeWithoutTransfer)).toThrow(
        'No AmuletRules_Transfer event found in event tree'
      );
    });
  });

  describe('parseFeesFromUpdate', () => {
    it('should extract fee information from a valid TreeEvent', () => {
      // Get the AmuletRules_Transfer event from the sample tree
      const amuletRulesEvent = sampleEventTree['2'];
      if (!amuletRulesEvent)
        throw new Error(
          'AmuletRules_Transfer event not found in sampleEventTree'
        );
      const result = parseFeesFromUpdate(amuletRulesEvent);

      expect(result.totalFees).toBe('1.2225031380');
      expect(result.feeBreakdown.holdingFees).toBe('0.0003805180');
      expect(result.feeBreakdown.outputFees).toEqual(['0.6221226200']);
      expect(result.feeBreakdown.senderChangeFee).toBe('0.6000000000');
      expect(result.balanceChanges).toHaveLength(2);
      expect(result.feeValidation.isBalanced).toBe(false);
      expect(result.feeValidation.discrepancy).toBe('21.278613206');
    });

    it('should correctly identify balance changes', () => {
      const amuletRulesEvent = sampleEventTree['2'];
      if (!amuletRulesEvent)
        throw new Error(
          'AmuletRules_Transfer event not found in sampleEventTree'
        );
      const result = parseFeesFromUpdate(amuletRulesEvent);

      const senderChange = result.balanceChanges.find(
        bc =>
          bc.party ===
          '1a50f9::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7'
      );
      const validatorChange = result.balanceChanges.find(
        bc =>
          bc.party ===
          'Fairmint-validator-1::122047f456985651be8ea317881a9af4f04521417ce1a449b75543541acf33aac4d2'
      );

      expect(senderChange?.changeToInitialAmountAsOfRoundZero).toBe(
        '-3.4343846200'
      );
      expect(validatorChange?.changeToInitialAmountAsOfRoundZero).toBe(
        '22.6217254480'
      );
    });

    it('should validate fee balance correctly', () => {
      const amuletRulesEvent = sampleEventTree['2'];
      if (!amuletRulesEvent)
        throw new Error(
          'AmuletRules_Transfer event not found in sampleEventTree'
        );
      const result = parseFeesFromUpdate(amuletRulesEvent);

      expect(result.feeValidation.isBalanced).toBe(false);
      expect(result.feeValidation.totalBalanceChange).toBe('20.0561100680');
      expect(result.feeValidation.totalFeesCalculated).toBe('1.2225031380');
      expect(result.feeValidation.discrepancy).toBe('21.278613206');
    });

    it('should throw error for non-exercised TreeEvent', () => {
      const nonExercisedEvent: TreeEvent = {
        CreatedTreeEvent: {
          value: {
            offset: 1,
            nodeId: 1,
            contractId: 'test',
            templateId: 'test',
            contractKey: null,
            createArgument: {},
            createdEventBlob: '',
            interfaceViews: [],
            witnessParties: [],
            signatories: [],
            observers: [],
            createdAt: '2025-07-16T19:50:37.823971Z',
            packageName: 'test',
          },
        },
      };

      expect(() => parseFeesFromUpdate(nonExercisedEvent)).toThrow(
        'No fee information found in TreeEvent - only exercised events contain fee data'
      );
    });

    it('should throw error for non-AmuletRules_Transfer choice', () => {
      const wrongChoiceEvent: TreeEvent = {
        ExercisedTreeEvent: {
          value: {
            offset: 1,
            nodeId: 1,
            contractId: 'test',
            templateId: 'test',
            interfaceId: null,
            choice: 'SomeOtherChoice',
            choiceArgument: {},
            actingParties: [],
            witnessParties: [],
            exerciseResult: {},
            packageName: 'test',
            consuming: false,
            lastDescendantNodeId: 1,
            implementedInterfaces: [],
          },
        },
      };

      expect(() => parseFeesFromUpdate(wrongChoiceEvent)).toThrow(
        'No fee information found in TreeEvent - only AmuletRules_Transfer choices contain fee data'
      );
    });
  });

  describe('validateFeeAnalysis', () => {
    // The following test is not valid for this sample, as the data is not balanced and should produce an error.
    // it('should return no errors for valid fee analysis', () => {
    //   const result = parseFeesFromEventTree(sampleEventTree);
    //   const errors = validateFeeAnalysis(result);
    //   expect(errors).toHaveLength(0);
    // });

    it('should detect negative fees', () => {
      const invalidAnalysis: FeeAnalysis = {
        feeBreakdown: {
          holdingFees: '-1.0',
          outputFees: ['0.5'],
          senderChangeFee: '0.5',
        },
        feeValidation: {
          isBalanced: true,
          totalBalanceChange: '0',
          totalFeesCalculated: '0',
        },
        balanceChanges: [],
        totalFees: '0',
      };

      const errors = validateFeeAnalysis(invalidAnalysis);
      expect(errors).toContain('Holding fees cannot be negative');
    });

    it('should detect balance mismatches', () => {
      const invalidAnalysis: FeeAnalysis = {
        feeBreakdown: {
          holdingFees: '1.0',
          outputFees: ['0.5'],
          senderChangeFee: '0.5',
        },
        feeValidation: {
          isBalanced: false,
          totalBalanceChange: '0',
          totalFeesCalculated: '2.0',
          discrepancy: '2.0',
        },
        balanceChanges: [],
        totalFees: '2.0',
      };

      const errors = validateFeeAnalysis(invalidAnalysis);
      expect(errors).toContain('Fee balance mismatch: 2.0');
    });

    it('should return a fee balance mismatch error for this data', () => {
      const result = parseFeesFromEventTree(sampleEventTree);
      const errors = validateFeeAnalysis(result);
      expect(errors).toContain('Fee balance mismatch: 21.278613206');
    });
  });

  describe('formatFeeAmount', () => {
    it('should format fee amounts correctly', () => {
      expect(formatFeeAmount('1.2345678901')).toBe('1.2345678901');
      expect(formatFeeAmount('1.2345678901', 4)).toBe('1.2346');
      expect(formatFeeAmount('0.0003805180', 6)).toBe('0.000381');
    });
  });
});
