# Nostr Vanity Key Generator

Mine Nostr public keys (npubs) with custom vanity prefixes.

## Setup

```bash
npm install
```

## Usage

Pass your desired prefixes as arguments:

```bash
node vanity-generator.js g0lf eagle putt green wedge
```

Comma-separated works too:

```bash
node vanity-generator.js g0lf,eagle,putt,green
```

Invalid bech32 characters are automatically detected and skipped.

### Valid bech32 characters

```
q p z r y 9 x 8 g f 2 t v d w 0 s 3 j n 5 4 k h c e 6 m u a 7 l
```

Characters **not** available: `b i o 1`

### Mining times (approximate)

- 4 characters: minutes
- 5 characters: hours
- 6 characters: days
- 7+ characters: weeks

### Controls

- `Ctrl+C` to stop and save progress
- Resumes from where it left off on next run (loads saved keys)

### Keep it running on macOS

```bash
caffeinate -i node vanity-generator.js g0lf eagle putt
```

## Encryption

Keys are saved to `pow-keys.enc` using AES-256-CBC encryption. You should set a password via the `ENCRYPTION_KEY` environment variable.

### Generate a secure password

```bash
openssl rand -base64 32
```

Save the output somewhere safe (password manager, etc). You'll need it to decrypt your keys later.

### Mine with encryption (without exposing the password in shell history)

```bash
read -s ENCRYPTION_KEY && export ENCRYPTION_KEY
```

This prompts you to type/paste your password without echoing it to the terminal or saving it in shell history. Then run:

```bash
node vanity-generator.js g0lf eagle putt
```

### Read your keys

With the same `ENCRYPTION_KEY` still exported:

```bash
node read-keys.js
```

### Clean up when done

Unset the password from your shell session:

```bash
unset ENCRYPTION_KEY
```

### Full workflow

```bash
# 1. Generate a password (save this somewhere safe!)
openssl rand -base64 32

# 2. Set password without exposing it
read -s ENCRYPTION_KEY && export ENCRYPTION_KEY
# (paste your password, press enter)

# 3. Mine
node vanity-generator.js g0lf eagle putt green

# 4. Read results
node read-keys.js

# 5. Clean up
unset ENCRYPTION_KEY
```

## Reading keys

```bash
node read-keys.js
```

Displays all found keys with their npub and nsec (private key). Make sure `ENCRYPTION_KEY` is set to the same password used during mining.

## Security notes

- Never share your private keys (nsec)
- Keep secure backups of both your keys file and encryption password
- Use `read -s` to avoid passwords appearing in shell history
- Don't run this script where others can see the terminal output of `read-keys.js`
