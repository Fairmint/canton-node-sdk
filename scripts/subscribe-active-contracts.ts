import 'dotenv/config';
import WebSocket from 'ws';
import axios from 'axios';
import { LedgerJsonApiClient } from '../src';

async function main(): Promise<void> {
  const host = 'ledger-api.validator.devnet.transfer-agent.xyz';
  const updatesPath = '/v2/updates/flats';
  const ledgerEndPath = '/v2/state/ledger-end';

  const partyId = 'TransferAgent-devnet-1::1220ea70ea2cbfe6be431f34c7323e249c624a02fb2209d2b73fabd7eea1fe84df34';

  // Require a bearer token; fail fast if missing
  const client = new LedgerJsonApiClient();
  const token = await client.authenticate();
  if (!token) {
    console.error('Missing bearer token. Check your env configuration.');
    process.exit(1);
  }
  const authHeader = `Bearer ${token}`;

  // Get the current ledger end to seed a continuous stream
  const ledgerEndResp = await axios.get<{ offset: number }>(`https://${host}${ledgerEndPath}`, {
    headers: { Authorization: authHeader },
    timeout: 30000,
  });
  const beginExclusive = ledgerEndResp.data.offset;

  // Build continuous updates request
  const requestMessage = {
    beginExclusive,
    verbose: false,
    updateFormat: {
      includeTransactions: {
        eventFormat: {
          filtersByParty: {
            [partyId]: {
              cumulative: [
                {
                  identifierFilter: {
                    WildcardFilter: {
                      value: {
                        includeCreatedEventBlob: true,
                      },
                    },
                  },
                },
              ],
            },
          },
          verbose: false,
        },
        transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
      },
    },
  } as const;

  const urlsToTry = [`wss://${host}${updatesPath}`];

  async function connect(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const tryProtocols = ['daml.ws.auth', 'daml-ledger-api'] as const;
      let attempt = 0;
      let socket: WebSocket | undefined;

      const attemptConnect = () => {
        const protocol = tryProtocols[attempt];
        socket = new WebSocket(url, protocol, {
          handshakeTimeout: 30000,
          headers: { Authorization: authHeader },
        });

        const onError = (err: Error) => {
          cleanup();
          if (attempt + 1 < tryProtocols.length) {
            attempt += 1;
            attemptConnect();
          } else {
            reject(err);
          }
        };
        const onOpen = () => {
          cleanup();
          resolve(socket!);
        };
        const cleanup = () => {
          socket?.off('error', onError);
          socket?.off('open', onOpen);
        };

        socket.on('error', onError);
        socket.on('open', onOpen);
      };

      attemptConnect();
    });
  }

  let socket: WebSocket | undefined;
  let lastError: unknown;
  for (const url of urlsToTry) {
    try {
      console.log(`Attempting WebSocket connection: ${url}`);
      socket = await connect(url);
      console.log(`Connected: ${url}`);
      break;
    } catch (err) {
      console.warn(`Connection failed for ${url}:`, (err as Error).message);
      lastError = err;
    }
  }

  if (!socket) {
    console.error('All WebSocket connection attempts failed');
    if (lastError) console.error(lastError);
    process.exit(1);
  }

  socket.on('message', data => {
    try {
      const parsed = JSON.parse(data.toString());
      console.log(JSON.stringify(parsed));
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  });

  socket.on('close', (code, reason) => {
    console.log(`Stream closed: ${code} ${reason.toString()}`);
  });

  socket.on('error', err => {
    console.error('Stream error:', err);
  });

  // Send initial request
  socket.send(JSON.stringify(requestMessage));

  // Keepalive ping to prevent idle closes by intermediaries
  const pingInterval = setInterval(() => {
    try {
      socket.ping();
    } catch {}
  }, 30000);
  socket.on('close', () => clearInterval(pingInterval));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
