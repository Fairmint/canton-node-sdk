# LocalNet Quick Start

⚡ **Fast setup guide for running regression tests against LocalNet**

## 🚀 First Time Setup (5 minutes)

### 1. Download LocalNet

```bash
npm run localnet:setup
```

### 2. Set Environment Variables

Add to `~/.bashrc` or `~/.zshrc`:

```bash
export LOCALNET_DIR="/tmp/splice-localnet/splice-node/docker-compose/localnet"
export IMAGE_TAG="0.4.22"
```

Then reload:

```bash
source ~/.bashrc  # or ~/.zshrc
```

### 3. Configure Environment

```bash
cp example.env.localnet .env
```

**Note**: You may need to update `CANTON_LOCALNET_APP_PROVIDER_PARTY_ID` after starting LocalNet.

## 🧪 Daily Usage

### Start Testing

```bash
npm run localnet:start    # Start LocalNet (takes 1-2 minutes)
npm run test:regression   # Run all tests
npm run localnet:stop     # Clean up
```

### Check Status

```bash
npm run localnet:status
```

## 🔗 Quick Links

Once LocalNet is running:

- **App Provider Wallet**: http://wallet.localhost:3000
- **Scan UI**: http://scan.localhost:4000
- **JSON API**: http://localhost:39750

## 📊 Understanding Test Results

Test results are saved to:

```
simulations/results/
├── ledger-json-api/v2/...
└── validator-api/registry/...
```

Each file is a JSON snapshot of an API response or error.

## 🐛 Common Issues

### "Port already in use"

```bash
npm run localnet:stop  # Clean up previous instance
```

### "Health checks failing"

```bash
# Wait longer (can take 2 minutes)
npm run localnet:status
```

### "LOCALNET_DIR not set"

```bash
# Add to shell profile and reload:
export LOCALNET_DIR="/tmp/splice-localnet/splice-node/docker-compose/localnet"
export IMAGE_TAG="0.4.22"
source ~/.bashrc
```

## 📚 Full Documentation

- [LocalNet Testing Guide](./docs/LOCALNET_TESTING.md) - Complete setup and troubleshooting
- [CircleCI Setup Guide](./docs/CIRCLECI_SETUP.md) - CI/CD configuration details

## 🎯 CircleCI Testing

Tests run automatically on every commit. View results at:
https://app.circleci.com/pipelines/github/YOUR_ORG/canton-node-sdk

## ⏱️ Time Expectations

| Task             | Time        |
| ---------------- | ----------- |
| First-time setup | 5-7 minutes |
| Start LocalNet   | 1-2 minutes |
| Run all tests    | 2-5 minutes |
| Stop LocalNet    | 10 seconds  |

## 💡 Pro Tips

1. **Leave LocalNet running** between test runs to save time
2. **Check logs** for specific services:
   ```bash
   docker compose -f $LOCALNET_DIR/compose.yaml logs -f app-provider
   ```
3. **Access Canton Console** for debugging:
   ```bash
   docker compose -f $LOCALNET_DIR/compose.yaml run --rm console
   ```

---

**Need help?** See [LOCALNET_TESTING.md](./docs/LOCALNET_TESTING.md) for detailed troubleshooting.
