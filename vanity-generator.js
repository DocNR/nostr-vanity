const { getPublicKey, nip19 } = require('nostr-tools');
const crypto = require('crypto');
const fs = require('fs').promises;
const readline = require('readline');

const ALGORITHM = 'aes-256-cbc';
const KEYS_FILE = 'pow-keys.enc';
const BECH32_CHARS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

let encryptionKey = '';
let foundKeys = new Map();
let isRunning = true;

// --- Prompts ---

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function askBech32(question) {
    return new Promise(resolve => {
        process.stdout.write(question);
        const stdin = process.stdin;
        if (stdin.isTTY) stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        const allowed = BECH32_CHARS + ' ,';
        let input = '';
        const onData = (c) => {
            if (c === '\n' || c === '\r') {
                if (stdin.isTTY) stdin.setRawMode(false);
                stdin.removeListener('data', onData);
                stdin.pause();
                process.stdout.write('\n');
                resolve(input);
            } else if (c === '\u0003') {
                process.stdout.write('\n');
                process.exit(0);
            } else if (c === '\u007f' || c === '\b') {
                if (input.length > 0) {
                    input = input.slice(0, -1);
                    process.stdout.write('\b \b');
                }
            } else if (allowed.includes(c.toLowerCase())) {
                input += c.toLowerCase();
                process.stdout.write(c.toLowerCase());
            }
            // invalid chars are silently ignored
        };

        stdin.on('data', onData);
    });
}

function askPassword(question) {
    return new Promise(resolve => {
        process.stdout.write(question);
        const stdin = process.stdin;
        if (stdin.isTTY) stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        let password = '';
        const onData = (c) => {
            if (c === '\n' || c === '\r') {
                if (stdin.isTTY) stdin.setRawMode(false);
                stdin.removeListener('data', onData);
                stdin.pause();
                process.stdout.write('\n');
                resolve(password);
            } else if (c === '\u0003') {
                process.stdout.write('\n');
                process.exit(0);
            } else if (c === '\u007f' || c === '\b') {
                if (password.length > 0) {
                    password = password.slice(0, -1);
                    process.stdout.write('\b \b');
                }
            } else {
                password += c;
                process.stdout.write('*');
            }
        };

        stdin.on('data', onData);
    });
}

// --- Crypto ---

function generatePrivateKey() {
    return crypto.randomBytes(32).toString('hex');
}

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { iv: iv.toString('hex'), content: encrypted };
}

function decrypt(encrypted) {
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const iv = Buffer.from(encrypted.iv, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// --- Key storage ---

async function saveKeys(keys) {
    const keysData = {};
    keys.forEach((value, prefix) => {
        keysData[prefix] = {
            privateKey: value.privateKey,
            publicKey: value.publicKey,
            npub: value.npub,
            foundAt: new Date().toISOString()
        };
    });
    const encrypted = encrypt(JSON.stringify(keysData, null, 2));
    await fs.writeFile(KEYS_FILE, JSON.stringify(encrypted, null, 2));
}

async function loadSavedKeys() {
    try {
        const fileContent = await fs.readFile(KEYS_FILE, 'utf8');
        const encrypted = JSON.parse(fileContent);
        const decrypted = decrypt(encrypted);
        const keysData = JSON.parse(decrypted);
        const loadedKeys = new Map();
        Object.entries(keysData).forEach(([prefix, value]) => {
            loadedKeys.set(prefix, value);
        });
        return loadedKeys;
    } catch (error) {
        if (error.code === 'ENOENT') return new Map();
        if (error.code === 'ERR_OSSL_BAD_DECRYPT' || error.message.includes('bad decrypt')) {
            console.log('Wrong password for existing keys file. Starting fresh.');
            return new Map();
        }
        throw error;
    }
}

// --- Validation ---

function validatePrefix(prefix) {
    const lower = prefix.toLowerCase();
    const invalid = [...lower].filter(c => !BECH32_CHARS.includes(c));
    if (invalid.length > 0) {
        console.log(`  "${prefix}" — skipped (invalid chars: ${[...new Set(invalid)].join(', ')})`);
        return null;
    }
    return lower;
}

function parsePrefixes(input) {
    const parts = input.split(/[\s,]+/).filter(Boolean);
    const valid = [];
    for (const p of parts) {
        const cleaned = validatePrefix(p);
        if (cleaned) valid.push(cleaned);
    }
    return valid;
}

function parseTime(input) {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed || trimmed === '0') return null; // run forever

    const match = trimmed.match(/^(\d+)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|s|sec|secs|seconds?)?$/);
    if (!match) return null;

    const num = parseInt(match[1]);
    const unit = match[2] || 'm'; // default to minutes

    if (unit.startsWith('s')) return num * 1000;
    if (unit.startsWith('h')) return num * 60 * 60 * 1000;
    return num * 60 * 1000; // minutes
}

function formatMs(ms) {
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    if (hrs > 0) return `${hrs}h ${remainMins}m`;
    return `${mins}m`;
}

// --- SIGINT ---

process.on('SIGINT', async () => {
    if (!isRunning) process.exit(0);
    isRunning = false;
    console.log('\n\nShutting down...');
    if (foundKeys.size > 0) {
        try {
            await saveKeys(foundKeys);
            console.log('Keys saved.');
        } catch (e) {
            console.error('Error saving:', e);
        }
    }
    process.exit(0);
});

// --- Mining ---

async function generateVanityNpub(prefixes, timeLimit) {
    let attempts = 0;
    const startTime = Date.now();
    const remainingPrefixes = new Set(prefixes);
    const fullPrefixes = Array.from(remainingPrefixes).map(p => 'npub1' + p);

    foundKeys = await loadSavedKeys();
    if (foundKeys.size > 0) {
        console.log('\nPreviously found:');
        foundKeys.forEach((value, prefix) => {
            console.log(`  ${value.npub}`);
            remainingPrefixes.delete(prefix);
        });
    }

    if (remainingPrefixes.size === 0) {
        console.log('\nAll prefixes already found!');
        return foundKeys;
    }

    console.log('\nSearching for:', Array.from(remainingPrefixes).join(', '));
    if (timeLimit) {
        console.log(`Will run for ${formatMs(timeLimit)}`);
    }
    console.log('');

    while (remainingPrefixes.size > 0 && isRunning) {
        if (timeLimit && (Date.now() - startTime) >= timeLimit) {
            console.log(`\n\nTime limit reached (${formatMs(timeLimit)}).`);
            break;
        }

        attempts++;

        try {
            const privateKey = generatePrivateKey();
            const publicKey = getPublicKey(privateKey);
            const npub = nip19.npubEncode(publicKey);

            for (const prefix of fullPrefixes) {
                if (npub.startsWith(prefix)) {
                    const originalPrefix = prefix.slice(5);
                    foundKeys.set(originalPrefix, { privateKey, publicKey, npub });
                    remainingPrefixes.delete(originalPrefix);

                    console.log(`\nFOUND: ${npub}`);
                    await saveKeys(foundKeys);

                    if (remainingPrefixes.size > 0) {
                        console.log('Still searching for:', Array.from(remainingPrefixes).join(', '));
                    }
                }
            }
        } catch (error) {
            continue;
        }

        if (attempts % 10000 === 0) {
            const elapsed = formatMs(Date.now() - startTime);
            if (timeLimit) {
                const remaining = formatMs(Math.max(0, timeLimit - (Date.now() - startTime)));
                process.stdout.write(`\r${attempts.toLocaleString()} attempts — ${remaining} remaining`);
            } else {
                process.stdout.write(`\r${attempts.toLocaleString()} attempts — ${elapsed} elapsed`);
            }
        }
    }

    return foundKeys;
}

// --- Main ---

async function main() {
    console.log('=== Nostr Vanity npub Miner ===\n');

    // 1. Password
    encryptionKey = await askPassword('Encryption password: ');
    if (!encryptionKey) {
        console.log('No password entered. Exiting.');
        process.exit(1);
    }

    // 2. Prefixes
    console.log(`\nValid bech32 chars: ${BECH32_CHARS}`);
    console.log('(letters not available: b i o 1)\n');

    const input = await askBech32('Vanity prefixes (space or comma separated): ');
    const prefixes = parsePrefixes(input);
    if (prefixes.length === 0) {
        console.log('No valid prefixes. Exiting.');
        process.exit(1);
    }
    console.log(`\nWill search for: ${prefixes.join(', ')}`);

    // 3. Time limit
    const timeInput = await ask('\nTime limit (e.g. 30m, 2h, or press Enter for unlimited): ');
    const timeLimit = parseTime(timeInput);

    // 4. Instructions
    console.log('\n---');
    console.log('Press Ctrl+C anytime to stop and save found keys.');
    console.log(`Keys are saved to: ${KEYS_FILE}`);
    console.log('To read your keys later, run: node read-keys.js');
    console.log('---');

    // 5. Mine
    const results = await generateVanityNpub(prefixes, timeLimit);

    if (results.size > 0) {
        await saveKeys(results);
        console.log('\n\nFound npubs:');
        results.forEach((value, prefix) => {
            console.log(`  ${value.npub}`);
        });
        console.log(`\nKeys saved to ${KEYS_FILE}`);
        console.log('Run "node read-keys.js" and enter your password to view them.');
    } else {
        console.log('\n\nNo keys found this session.');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
