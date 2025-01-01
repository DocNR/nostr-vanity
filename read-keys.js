const crypto = require('crypto');
const fs = require('fs').promises;
const { nip19 } = require('nostr-tools');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secure-password-here';
const ALGORITHM = 'aes-256-cbc';
const KEYS_FILE = 'pow-keys.enc';

function decrypt(encrypted) {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = Buffer.from(encrypted.iv, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encrypted.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

function hexToUint8Array(hexString) {
    // Remove '0x' prefix if present
    hexString = hexString.replace('0x', '');
    
    // Ensure even number of characters
    if (hexString.length % 2 !== 0) {
        hexString = '0' + hexString;
    }
    
    // Convert hex string to Uint8Array
    const bytes = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
        bytes[i/2] = parseInt(hexString.substr(i, 2), 16);
    }
    return bytes;
}

async function readKeys() {
    try {
        const fileContent = await fs.readFile(KEYS_FILE, 'utf8');
        const encrypted = JSON.parse(fileContent);
        const decrypted = decrypt(encrypted);
        const keys = JSON.parse(decrypted);
        
        console.log('\nFound Keys:');
        Object.entries(keys).forEach(([prefix, value]) => {
            // Convert hex private key to Uint8Array
            const privateKeyBytes = hexToUint8Array(value.privateKey);
            // Convert to nsec format
            const nsec = nip19.nsecEncode(privateKeyBytes);
            
            console.log(`\nPrefix: ${prefix}`);
            console.log('Private Key (hex):', value.privateKey);
            console.log('Private Key (nsec):', nsec);
            console.log('Public Key:', value.publicKey);
            console.log('npub:', value.npub);
            console.log('Found At:', value.foundAt);
        });
    } catch (error) {
        console.error('Error reading keys:', error);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
}

readKeys();