const { Wallet, CoinType, initLogger } = require('@iota/iota-sdk');
const fs = require('fs');
const path = require('path');

// Initialize logger
initLogger();

// Configuration
const SHIMMER_TESTNET_BECH32_HRP = 'rms';

async function generateWallet() {
    console.log('🚀 Generating new IOTA Shimmer wallet...\n');
    
    try {
        // Create wallet instance
        const wallet = new Wallet({
            storagePath: './temp-wallet-db',
            coinType: CoinType.Shimmer,
            clientOptions: {
                nodes: ['https://api.testnet.shimmer.network'],
                localPow: true,
            },
            secretManager: {
                // This will generate a new mnemonic
            },
        });

        // Generate mnemonic and create account
        console.log('📋 Generating mnemonic...');
        const mnemonic = await wallet.generateMnemonic();
        
        // Update secret manager with the mnemonic
        wallet.setSecretManager({ mnemonic });
        
        // Create a new account
        console.log('💳 Creating account...');
        const account = await wallet.createAccount({
            alias: 'remittance-wallet',
            bech32Hrp: SHIMMER_TESTNET_BECH32_HRP,
        });

        // Get the first address
        const address = await account.address();
        
        // Sync account to get initial balance
        console.log('🔄 Syncing account...');
        await account.sync();
        const balance = await account.getBalance();

        // Display wallet information
        console.log('\n✅ Wallet generated successfully!\n');
        console.log('🔐 Mnemonic (SAVE THIS SECURELY!):');
        console.log(`   ${mnemonic}\n`);
        console.log('📍 Address:', address.bech32);
        console.log('💰 Balance:', balance.baseCoin.total, 'tokens');
        console.log('🌐 Network: Shimmer Testnet');
        console.log('⚠️  This is a TESTNET wallet - use only for testing!\n');

        // Save wallet details to file
        const walletInfo = {
            mnemonic: mnemonic,
            address: address.bech32,
            network: 'shimmer-testnet',
            generatedAt: new Date().toISOString(),
            warning: 'This is a testnet wallet. Keep the mnemonic secure and never share it!'
        };

        const walletFile = path.join(__dirname, 'wallet-info.json');
        fs.writeFileSync(walletFile, JSON.stringify(walletInfo, null, 2));
        console.log(`💾 Wallet info saved to: ${walletFile}`);

        // Create .env file template
        const envTemplate = `# IOTA Remittance Backend Configuration
# Generated on: ${new Date().toISOString()}

# Your wallet mnemonic - KEEP THIS SECURE!
MNEMONIC="${mnemonic}"

# Server configuration
PORT=3000

# IOTA Network (testnet)
IOTA_NETWORK=testnet
NODE_URL=https://api.testnet.shimmer.network
`;

        const envFile = path.join(__dirname, '.env.template');
        fs.writeFileSync(envFile, envTemplate);
        console.log(`📝 Environment template saved to: ${envFile}`);
        console.log('\n🎉 Setup complete! Copy the mnemonic to your .env file and start the server.');

        // Clean up temporary wallet database
        if (fs.existsSync('./temp-wallet-db')) {
            fs.rmSync('./temp-wallet-db', { recursive: true, force: true });
            console.log('🧹 Temporary wallet database cleaned up.');
        }

    } catch (error) {
        console.error('❌ Error generating wallet:', error);
        process.exit(1);
    }
}

// Check if this is being run directly
if (require.main === module) {
    generateWallet().catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { generateWallet };