const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { nip19 } = require('nostr-tools');

const ALGORITHM = 'aes-256-cbc';
const CONFIG_FILE = '.vanity-config.json';

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

function decrypt(encryptionKey, encrypted) {
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const iv = Buffer.from(encrypted.iv, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function hexToUint8Array(hexString) {
    hexString = hexString.replace('0x', '');
    if (hexString.length % 2 !== 0) hexString = '0' + hexString;
    const bytes = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
        bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
    }
    return bytes;
}

async function loadConfig() {
    try {
        const content = await fs.readFile(CONFIG_FILE, 'utf8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

async function main() {
    const config = await loadConfig();

    if (!config) {
        console.log('No keys found yet. Run the miner first: node vanity-generator.js');
        process.exit(1);
    }

    const keysFile = config.keysFile;
    const isEncrypted = config.encrypted;

    console.log(`Reading keys from: ${keysFile}\n`);

    let password = '';
    if (isEncrypted) {
        password = await askPassword('Password: ');
        if (!password) {
            console.log('No password entered.');
            process.exit(1);
        }
    }

    try {
        const fileContent = await fs.readFile(keysFile, 'utf8');
        let keys;

        if (isEncrypted) {
            const encData = JSON.parse(fileContent);
            const decrypted = decrypt(password, encData);
            keys = JSON.parse(decrypted);
        } else {
            keys = JSON.parse(fileContent);
        }

        const entries = Object.entries(keys);
        if (entries.length === 0) {
            console.log('No keys found.');
            return;
        }

        console.log(`\n${entries.length} key(s) found:\n`);
        entries.forEach(([prefix, value]) => {
            const privateKeyBytes = hexToUint8Array(value.privateKey);
            const nsec = nip19.nsecEncode(privateKeyBytes);

            console.log(`--- ${prefix} ---`);
            console.log('  npub:', value.npub);
            console.log('  nsec:', nsec);
            console.log('  found:', value.foundAt);
            console.log('');
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`File not found: ${keysFile}`);
        } else if (error.message.includes('bad decrypt')) {
            console.log('\nWrong password.');
        } else {
            console.error('Error:', error.message);
        }
    }
}

main();
