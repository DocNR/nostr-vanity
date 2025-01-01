const { getPublicKey, nip19 } = require('nostr-tools');
const { bech32 } = require('bech32');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// Encryption settings
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secure-password-here'; // You should set this as an environment variable
const ALGORITHM = 'aes-256-cbc';
const KEYS_FILE = 'pow-keys.enc';

// Function to generate a private key
function generatePrivateKey() {
    return crypto.randomBytes(32).toString('hex');
}

// Encryption functions
function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
        iv: iv.toString('hex'),
        content: encrypted
    };
}

function decrypt(encrypted) {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = Buffer.from(encrypted.iv, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encrypted.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

// Function to save keys to encrypted file
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
    console.log(`\nSaved keys to ${KEYS_FILE}`);
}

// Function to load previously saved keys
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
        if (error.code === 'ENOENT') {
            return new Map();
        }
        throw error;
    }
}

// Store found keys
let foundKeys = new Map();
let isRunning = true;

// Add this near the top of your script with the other process handlers
process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    isRunning = false;  // This will stop the main loop
    
    console.log('Found keys so far:');
    foundKeys.forEach((value, prefix) => {
        console.log(`\nPrefix ${prefix}:`);
        console.log('Private key:', value.privateKey);
        console.log('Public key:', value.publicKey);
        console.log('npub:', value.npub);
    });
    
    if (foundKeys.size > 0) {
        try {
            await saveKeys(foundKeys);
        } catch (error) {
            console.error('Error saving keys:', error);
        }
    }
    
    // Force exit after 1 second if still running
    setTimeout(() => {
        console.log('Forcing exit...');
        process.exit(0);
    }, 1000);
});

// Handle Ctrl+C and other termination signals
process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    console.log('Found keys so far:');
    foundKeys.forEach((value, prefix) => {
        console.log(`\nPrefix ${prefix}:`);
        console.log('Private key:', value.privateKey);
        console.log('Public key:', value.publicKey);
        console.log('npub:', value.npub);
    });
    
    if (foundKeys.size > 0) {
        await saveKeys(foundKeys);
    }
    
    process.exit(0);
});

async function generateVanityNpub(prefixes) {
    let attempts = 0;
    const startTime = Date.now();
    const remainingPrefixes = new Set(prefixes);
    
    // Add 'npub1' to all prefixes
    const fullPrefixes = Array.from(remainingPrefixes).map(p => 'npub1' + p);
    
    console.log('\nLoading previously found keys...');
    foundKeys = await loadSavedKeys();
    if (foundKeys.size > 0) {
        console.log('Found previously saved keys for prefixes:', Array.from(foundKeys.keys()).join(', '));
        // Remove already found prefixes
        foundKeys.forEach((_, prefix) => remainingPrefixes.delete(prefix));
    }
    
    console.log('\nPress Ctrl+C at any time to safely stop and save found keys\n');
    
    while (remainingPrefixes.size > 0 && isRunning) {
        attempts++;
        
        try {
            // Generate and validate keys
            const privateKey = generatePrivateKey();
            const publicKey = getPublicKey(privateKey);
            const npub = nip19.npubEncode(publicKey);
            
            // Verify the keys are valid
            const decodedPubkey = nip19.decode(npub);
            if (decodedPubkey.data !== publicKey) {
                console.error('\nKey validation failed, skipping...');
                continue;
            }
            
            // Check for matches
            for (const prefix of fullPrefixes) {
                if (npub.startsWith(prefix)) {
                    const originalPrefix = prefix.slice(5); // Remove 'npub1'
                    const duration = (Date.now() - startTime) / 1000;
                    const rate = attempts / duration;
                    
                    const result = {
                        privateKey,
                        publicKey,
                        npub,
                        attempts,
                        duration,
                        rate
                    };
                    
                    foundKeys.set(originalPrefix, result);
                    remainingPrefixes.delete(originalPrefix);
                    
                    console.log('\n🎉 Found matching key for prefix:', originalPrefix);
                    console.log('npub:', npub);
                    console.log(`Time taken: ${duration.toFixed(2)} seconds`);
                    console.log(`Rate: ${rate.toFixed(2)} attempts/second`);
                    
                    // Save keys immediately when found
                    await saveKeys(foundKeys);
                    
                    if (remainingPrefixes.size > 0) {
                        console.log('\nStill searching for:', Array.from(remainingPrefixes).join(', '));
                        console.log('Press Ctrl+C to stop and save found keys\n');
                    }
                }
            }
        } catch (error) {
            console.error('\nError generating/validating keys:', error.message);
            continue;
        }
        
        // Log progress every 1000 attempts
        if (attempts % 1000 === 0) {
            const currentTime = Date.now();
            const elapsed = (currentTime - startTime) / 1000;
            const rate = attempts / elapsed;
            process.stdout.write(`\rTried ${attempts.toLocaleString()} combinations... (${rate.toFixed(2)} attempts/sec)`);
        }
    }
    
    return foundKeys;
}

// Usage:
const desiredPrefixes = ['p0wp0w', 'p0wer','p0wr', 'pr0mot', 'prmtus', 'pr0mtus', 'pr0m0t', 'deezntz', 'dznuts', 'dznutz'];

console.log('Starting search for npub with prefixes:', desiredPrefixes.join(', '));
console.log('This might take a while... Mining time is random and could be minutes to hours.');

try {
    generateVanityNpub(desiredPrefixes).then(results => {
        console.log('\n\nSearch completed!');
        results.forEach((value, prefix) => {
            console.log(`\nResults for prefix ${prefix}:`);
            console.log('Private key:', value.privateKey);
            console.log('Public key:', value.publicKey);
            console.log('npub:', value.npub);
            console.log(`Time taken: ${value.duration.toFixed(2)} seconds`);
            console.log(`Attempts needed: ${value.attempts.toLocaleString()}`);
            console.log(`Average rate: ${value.rate.toFixed(2)} attempts/second`);
        });
    });
} catch (error) {
    console.error('Error:', error.message);
}