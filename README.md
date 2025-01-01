# Nostr Vanity Key Generator

A command-line tool to mine Nostr public keys (npubs) with custom prefixes. Generate personalized Nostr identities that start with your chosen characters.

## Features

- Mine custom Nostr vanity keys (e.g., npub1cat...)
- Optional encryption for secure key storage
- Progress tracking with attempt rate display
- Automatic saving of found keys
- Support for multiple prefix targets in one run

## Prerequisites

- Node.js 16.0.0 or higher
- NPM (Node Package Manager)

## Installation

```bash
# Clone or download this repository
git clone [repository-url]

# Install dependencies
npm install
```

## Usage

### Basic Usage

```bash
# Start mining without encryption
node vanity-generator.js

# Start mining with encryption
export ENCRYPTION_KEY='your-secure-key'
node vanity-generator.js

# Read found keys
node read-keys.js
```

### Valid Characters

Vanity prefixes must use bech32 characters only:
```
qpzry9x8gf5tvuend2w0s3jn54khce6mua7l
```

Example valid prefixes:
- `cat`
- `max`
- `sats`
- `zap5`

### Keeping Process Running (MacOS)

Prevent system sleep while mining:
```bash
caffeinate -i node vanity-generator.js
```

Run in background:
```bash
nohup caffeinate -i node vanity-generator.js &
```

## Configuration

Edit `vanity-generator.js` to set your desired prefixes:
```javascript
const desiredPrefixes = ['cat', 'sat', 'nostr'];  // Change these
```

## Security

- Keys are saved to `pow-keys.enc` when encrypted, or `pow-keys.json` when unencrypted
- Use encryption for better security
- Never share your private keys (nsec)
- Keep secure backups of your keys and encryption password

## Mining Times

Expected times (approximate):
- 3 characters: minutes
- 4 characters: hours
- 5 characters: days
- 6+ characters: weeks or longer

Times vary based on your computer's speed and luck.

## Commands Reference

```bash
# Set encryption key
export ENCRYPTION_KEY='your-key-here'

# Remove encryption key
unset ENCRYPTION_KEY

# Find running process
ps aux | grep node

# Kill running process
kill <process_id>
```

## Example Output

```
Starting search for npub with prefixes: cat, sat
Tried 1000 combinations... (2356.2 attempts/sec)
...
🎉 Found matching key for prefix: cat
npub: npub1catx...
Time taken: 145.23 seconds
```

## License

MIT License

## Contributing

Pull requests welcome! Please follow our contribution guidelines.

## Support

Create an issue for bugs or feature requests.

## Acknowledgments

Built using:
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools)
- [bech32](https://github.com/bitcoinjs/bech32)