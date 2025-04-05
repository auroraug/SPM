import Client, {
    CommitmentLevel,
    SubscribeRequest,
    SubscribeUpdate,
    SubscribeUpdateTransaction,
} from "@triton-one/yellowstone-grpc";
import { Message, CompiledInstruction } from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
import { ClientDuplexStream } from '@grpc/grpc-js';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

// Constants
const ENDPOINT = "https://solana-yellowstone-grpc.publicnode.com:443";
const TOKEN = "c86c3e727fbcba5483a26584809a85b71a207f3d5d36db44567b6e4c93f5ae9e";
const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'; // pumpfun program
const Radium_Liquidity_PoolV4 = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
const PUMP_FUN_MINT_AUTHORITY = 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM';
const PUMP_FUN_Raydium_Migration = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg'
const PUMP_FUN_CREATE_IX_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]); // create
const COMMITMENT = CommitmentLevel.CONFIRMED;

// Configuration
const FILTER_CONFIG = {
    programIds: [PUMP_FUN_PROGRAM_ID],
    requiredAccounts: [PUMP_FUN_PROGRAM_ID,PUMP_FUN_MINT_AUTHORITY],
    instructionDiscriminators: [PUMP_FUN_CREATE_IX_DISCRIMINATOR]
};

const ACCOUNTS_TO_INCLUDE = [{
    name: "mint",
    index: 0
}];

// Type definitions
interface FormattedTransactionData {
    signature: string;
    slot: string;
    [accountName: string]: string;
}

// Main function
async function main(): Promise<void> {
    const client = new Client(ENDPOINT, TOKEN, {});
    const stream = await client.subscribe();
    const request = createSubscribeRequest();

    try {
        await sendSubscribeRequest(stream, request);
        console.log('Geyser connection established - watching new Pump.fun mints. \n');
        await handleStreamEvents(stream);
    } catch (error) {
        console.error('Error in subscription process:', error);
        stream.end();
    }
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

function handleStreamEvents(stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        stream.on('data', handleData);
        stream.on("error", (error: Error) => {
            console.error('Stream error:', error);
            reject(error);
            stream.end();
        });
        stream.on("end", () => {
            console.log('Stream ended');
            resolve();
        });
        stream.on("close", () => {
            console.log('Stream closed');
            resolve();
        });
    });
}

function handleData(data: SubscribeUpdate): void {
    if (!isSubscribeUpdateTransaction(data) || !data.filters.includes('pumpFun')) {
        return;
    }
    const options = {
        timeZone: "Asia/Shanghai",
        hour12: false,
    };
    const utc8 = new Date().toLocaleString('en-US',options);
    const transaction = data.transaction?.transaction;
    const message = transaction?.transaction?.message;

    if (!transaction || !message) {
        return;
    }

    const matchingInstruction = message.instructions.find(matchesInstructionDiscriminator);
    if (!matchingInstruction) {
        return;
    }

    const formattedSignature = convertSignature(transaction.signature);
    const formattedData = formatData(message, formattedSignature.base58, data.transaction.slot);

    if (formattedData) {
        console.log(utc8+'\n')
        console.log("======================================💊 New Pump.fun Mint Detected!======================================");
        console.table(formattedData);
        console.log("\n");
    }
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

function convertSignature(signature: Uint8Array): { base58: string } {
    return { base58: bs58.encode(Buffer.from(signature)) };
}

function formatData(message: Message, signature: string, slot: string): FormattedTransactionData | undefined {
    const matchingInstruction = message.instructions.find(matchesInstructionDiscriminator);

    if (!matchingInstruction) {
        return undefined;
    }

    const accountKeys = message.accountKeys;
    const includedAccounts = ACCOUNTS_TO_INCLUDE.reduce<Record<string, string>>((acc, { name, index }) => {
        const accountIndex = matchingInstruction.accounts[index];
        const publicKey = accountKeys[accountIndex];
        acc[name] = new PublicKey(publicKey).toBase58();
        return acc;
    }, {});

    return {
        signature,
        slot,
        ...includedAccounts
    };
}

function matchesInstructionDiscriminator(ix: CompiledInstruction): boolean {
    return ix?.data && FILTER_CONFIG.instructionDiscriminators.some(discriminator =>
        Buffer.from(discriminator).equals(ix.data.slice(0, 8))
    );
}

main().catch((err) => {
    console.error('Unhandled error in main:', err);
    process.exit(1);
});
