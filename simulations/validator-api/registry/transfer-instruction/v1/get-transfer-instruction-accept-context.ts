import ValidatorSimulationRunner from '../../../../core/ValidatorSimulationRunner';

const runner = new ValidatorSimulationRunner();

export async function runAllTests(): Promise<void> {
  await runner.runSimulation('valid', async (client) =>
    client.getTransferInstructionAcceptContext({
      transferInstructionId: 'contract-id-here',
    })
  );

  await runner.runSimulation('valid_with_meta', async (client) =>
    client.getTransferInstructionAcceptContext({
      transferInstructionId: 'contract-id-here',
      meta: { key: 'value', anotherKey: 'anotherValue' },
    })
  );

  await runner.runSimulation('invalid_transfer_instruction_id', async (client) =>
    client.getTransferInstructionAcceptContext({
      transferInstructionId: 'non-existent-contract-id',
    })
  );
}
