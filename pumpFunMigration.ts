import Client, {
    CommitmentLevel,
    SubscribeRequest,
    SubscribeUpdate,
    SubscribeUpdateTransaction,
} from "@triton-one/yellowstone-grpc";
import { ClientDuplexStream } from '@grpc/grpc-js';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

// Constants
const ENDPOINT = "https://solana-yellowstone-grpc.publicnode.com:443";
const TOKEN = "c86c3e727fbcba5483a26584809a85b71a207f3d5d36db44567b6e4c93f5ae9e";
const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'; // pumpfun program
const PUMP_FUN_Raydium_Migration = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg'
const PumpFunAMM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'
const PUMP_FUN_MIGRATE_IX_DISCRIMINATOR = Buffer.from([0x9b, 0xea, 0xe7, 0x92, 0xec, 0x9e, 0xa2, 0x1e]); // migrate
const COMMITMENT = CommitmentLevel.CONFIRMED;
const client = new Client(ENDPOINT, TOKEN, {});
let isShuttingDown = false
let currentStream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>
const processedCache = new Set();

// Configuration
const FILTER_CONFIG = {
    programIds: [PUMP_FUN_PROGRAM_ID],
    requiredAccounts: [PUMP_FUN_Raydium_Migration,PumpFunAMM],
    instructionDiscriminators: [PUMP_FUN_MIGRATE_IX_DISCRIMINATOR]
};

// Main function
async function manageStream(): Promise<void> {
    let isReconnecting = false
    currentStream = await client.subscribe();
    const request = createSubscribeRequest();
    await sendSubscribeRequest(currentStream, request);
    console.log('Geyser connection established - watching new Pump.fun migrates. \n');
    currentStream.on('data', handleData);
    currentStream.on("error", (error) => {
        // console.error('Stream error:',error);
        if (!isShuttingDown && !isReconnecting) {
            isReconnecting = true
            manageStream()
        }
        else currentStream.end()
    });
    currentStream.on("end", () => {
        // console.log('Stream ended');
        if (!isShuttingDown && !isReconnecting) {
            isReconnecting = true
            manageStream()
        }
    });
    currentStream.on("close", () => {
        console.log('Stream closed');
    });
    
}

// Helper functions
function createSubscribeRequest(): SubscribeRequest {
    return {
        accounts: {},
        slots: {},
        transactions: {
            pumpFun: {
                accountInclude: [],
                accountExclude: [],
                accountRequired: FILTER_CONFIG.requiredAccounts
            }
        },
        transactionsStatus: {},
        entry: {},
        blocks: {},
        blocksMeta: {},
        commitment: COMMITMENT,
        accountsDataSlice: [],
        ping: undefined,
    };
}

function sendSubscribeRequest(
    stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>,
    request: SubscribeRequest
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        stream.write(request, (err: Error | null) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function handleData(data: SubscribeUpdate): void {
    if (!isSubscribeUpdateTransaction(data) || !data.filters.includes('pumpFun')) {
        return;
    }
    const logs = data.transaction.transaction?.meta?.logMessages
    if (!logs || !logs.some((log, index) => log.includes('Migrate') && logs[index+1].includes('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'))) return
    const options = {
        timeZone: "Asia/Shanghai",
        hour12: false,
    };
    const signature = data.transaction.transaction?.signature
    console.log(signature?bs58.encode(Buffer.from(signature)):null) // converted signature from signatureBuffer
    const utc8 = new Date().toLocaleString('en-US',options);
    const transaction = data.transaction?.transaction;
    const message = transaction?.transaction?.message;
    if (!transaction || !message) {
        return;
    }
    let mintAddressIndex = message.accountKeys.findIndex(accbf => new PublicKey(accbf).toString().includes('pump'))
    let mintAddress = mintAddressIndex === -1? null:new PublicKey(message.accountKeys[mintAddressIndex]).toString()
    // console.log(message)
    // console.log(message.accountKeys.map((pub,index) => `${index}: ${new PublicKey(pub).toString()}`))
    
    // console.log('accountKeyIndex',[...matchingInstruction.accounts])
    if(!mintAddress) {
        const matchingInstruction = message.instructions.find(ix => (ix.data && Buffer.from(ix.data).includes(PUMP_FUN_MIGRATE_IX_DISCRIMINATOR)) || ix.accounts.length >= 24);
        if (!matchingInstruction) {
            return;
        }
        try {
            const accountIndex = matchingInstruction.accounts[1];
            const accountIndex_candidate = matchingInstruction.accounts[2];
            const publicKey = accountIndex >= message.accountKeys.length?null: new PublicKey(message.accountKeys[accountIndex]);
            const publicKey_candidate = new PublicKey(message.accountKeys[accountIndex_candidate]);
            mintAddress = publicKey && publicKey.toBase58() !== '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg'? publicKey.toBase58() : publicKey_candidate.toBase58();
            if (!mintAddress || mintAddress === '11111111111111111111111111111111') throw new Error('Error mintAddress')
        } catch (error) {
            console.error(error)
            console.log('Transaction Message:\n',message)
            console.log('Accounts',message.accountKeys.map((pub,index) => `${index}: ${new PublicKey(pub).toString()}`))
            console.log('accountKeyIndex',[...matchingInstruction.accounts])
            return
        }
        
    }
    if (processedCache.has(mintAddress)){
        console.log(`Failed txn ${signature?bs58.encode(Buffer.from(signature)):''} status:${data.transactionStatus}`)
        console.log(`Failed txn ${signature?bs58.encode(Buffer.from(signature)):''} error:${data.transactionStatus?.err}`)
        return
    }
    processedCache.add(mintAddress)
    setTimeout(() => {
        processedCache.delete(mintAddress)
    }, 15000)
    console.log(utc8+' ',mintAddress)
}

function isSubscribeUpdateTransaction(data: SubscribeUpdate): data is SubscribeUpdate & { transaction: SubscribeUpdateTransaction } {
    return (
        'transaction' in data &&
        typeof data.transaction === 'object' &&
        data.transaction !== null &&
        'slot' in data.transaction &&
        'transaction' in data.transaction
    );
}

process.on('SIGINT', () => {
    isShuttingDown = true;
    console.log('\nClosing stream...');
    currentStream.end(); 

    setTimeout(() => {
        console.log('Stream closed. Exiting.');
        process.exit(0);
    }, 1000);
});

manageStream()
setInterval(() => {
    processedCache.clear(); // clear all cache memory every 1hr
}, 1000 * 60 * 60);