const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Wallet, CoinType, initLogger } = require('@iota/iota-sdk');
require('dotenv').config();

// Initialize logger
initLogger();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// In-memory transaction storage for demo purposes
const transactions = [];

// Wallet configuration
const SHIMMER_TESTNET_HRP = 'rms';
const SHIMMER_TESTNET_BECH32_HRP = 'rms';

// Initialize wallet with mnemonic from environment
let wallet;
let account;

async function initializeWallet() {
    try {
        const mnemonic = process.env.MNEMONIC;
        if (!mnemonic) {
            console.error('MNEMONIC not found in environment variables');
            process.exit(1);
        }

        // Create wallet
        wallet = new Wallet({
            storagePath: './wallet-db',
            coinType: CoinType.Shimmer,
            clientOptions: {
                nodes: ['https://api.testnet.shimmer.network'],
                localPow: true,
            },
            secretManager: {
                mnemonic,
            },
        });

        // Get or create account
        const accountName = 'remittance-account';
        try {
            account = await wallet.getAccount(accountName);
        } catch (error) {
            // Account doesn't exist, create it
            account = await wallet.createAccount({
                alias: accountName,
                bech32Hrp: SHIMMER_TESTNET_BECH32_HRP,
            });
        }

        console.log('Wallet initialized successfully');
        console.log('Account address:', await account.address());
        
        // Sync account
        await account.sync();
        console.log('Account synced');
        
    } catch (error) {
        console.error('Failed to initialize wallet:', error);
        process.exit(1);
    }
}

// API Endpoints

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'IOTA Remittance API is running' });
});

// Get wallet info
app.get('/wallet-info', async (req, res) => {
    try {
        if (!account) {
            return res.status(500).json({ error: 'Wallet not initialized' });
        }

        const address = await account.address();
        const balance = await account.getBalance();
        
        res.json({
            address: address.bech32,
            balance: {
                total: balance.baseCoin.total,
                available: balance.baseCoin.available,
            },
        });
    } catch (error) {
        console.error('Error getting wallet info:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send transaction
app.post('/send', async (req, res) => {
    try {
        const { from, to, amount } = req.body;
        
        if (!from || !to || !amount) {
            return res.status(400).json({ 
                error: 'Missing required fields: from, to, amount' 
            });
        }

        if (!account) {
            return res.status(500).json({ error: 'Wallet not initialized' });
        }

        // Convert amount to SMR (1 SMR = 1,000,000 tokens)
        const amountInTokens = BigInt(amount * 1000000);
        
        console.log(`Sending ${amountInTokens} tokens from ${from} to ${to}`);

        // Send the transaction
        const response = await account.send(
            amountInTokens,
            to,
            {
                tag: '0x' + Buffer.from('REMITTANCE').toString('hex'),
                metadata: '0x' + Buffer.from(JSON.stringify({
                    type: 'remittance',
                    timestamp: new Date().toISOString(),
                    from: from,
                })).toString('hex'),
            }
        );

        const transactionId = response.transactionId;
        
        // Store transaction
        const transaction = {
            id: Date.now().toString(),
            transactionId: transactionId,
            from: from,
            to: to,
            amount: parseFloat(amount),
            networkFee: 0, // IOTA is feeless
            timestamp: new Date(),
            status: 'completed',
        };
        
        transactions.unshift(transaction);
        
        res.json({
            success: true,
            transactionId: transactionId,
            message: 'Transaction sent successfully',
        });
        
        console.log(`Transaction sent successfully: ${transactionId}`);
        
    } catch (error) {
        console.error('Error sending transaction:', error);
        
        // Store failed transaction for retry
        const failedTransaction = {
            id: Date.now().toString(),
            transactionId: null,
            from: req.body.from,
            to: req.body.to,
            amount: parseFloat(req.body.amount),
            networkFee: 0,
            timestamp: new Date(),
            status: 'failed',
            error: error.message,
        };
        
        transactions.unshift(failedTransaction);
        
        res.status(500).json({ 
            error: error.message,
            transactionId: null,
        });
    }
});

// Get transaction history
app.get('/history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const paginatedTransactions = transactions.slice(offset, offset + limit);
        
        res.json({
            transactions: paginatedTransactions,
            total: transactions.length,
            hasMore: offset + limit < transactions.length,
        });
        
    } catch (error) {
        console.error('Error getting transaction history:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get network info
app.get('/network-info', async (req, res) => {
    try {
        if (!wallet) {
            return res.status(500).json({ error: 'Wallet not initialized' });
        }

        const client = wallet.getClient();
        const info = await client.getInfo();
        
        res.json({
            network: 'shimmer-testnet',
            nodeUrl: 'https://api.testnet.shimmer.network',
            health: info.nodeInfo.isHealthy,
            latestMilestone: info.nodeInfo.status.latestMilestone.index,
        });
        
    } catch (error) {
        console.error('Error getting network info:', error);
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`IOTA Remittance API running on port ${PORT}`);
    
    // Initialize wallet
    initializeWallet().then(() => {
        console.log('Server ready to handle requests');
    }).catch((error) => {
        console.error('Failed to start server:', error);
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    process.exit(0);
});