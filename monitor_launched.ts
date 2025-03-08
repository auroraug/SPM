import { Connection, PublicKey } from '@solana/web3.js'
import { analyzeTokensCreatedByAccount , TokenAnalysis } from './fetchDevInfo'
import dotenv from "dotenv"
dotenv.config()

const RAYDIUM_PUBLIC_KEY = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const Pumpfun_Migration = "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg"
const HTTP_URL = `https://mainnet.helius-rpc.com/?api-key=${'HELIUS_API_KEY'}`;
const WSS_URL = `wss://mainnet.helius-rpc.com/?api-key=${'HELIUS_API_KEY'}`;
const PUMPFUN_GRADUATED = new PublicKey(Pumpfun_Migration)
const RAYDIUM = new PublicKey(RAYDIUM_PUBLIC_KEY);
const INSTRUCTION_NAME = "initialize2";

const connection = new Connection(HTTP_URL, {
    wsEndpoint: WSS_URL
});

function getTimeSpent(createTime: number | null): { utc8: string, timeSpent: string } {
    const utc8 = new Date().toLocaleString('en-US', {timeZone: 'Asia/Shanghai', hour12: false});
    
    if (!createTime) {
        return { utc8, timeSpent: 'N/A' };
    }

    const createdTime = new Date(createTime).toLocaleString('en-US', {timeZone: 'Asia/Shanghai'});
    const diffMs = Date.now() - createTime;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const timeSpent = `${days}d ${hours}h ${minutes}m (Created at ${createdTime})`;

    return { utc8, timeSpent };
}

async function startConnection(connection: Connection, programAddress: PublicKey, searchInstruction: string): Promise<void> {
    console.log("Monitoring logs for program:", programAddress.toString());
    connection.onLogs(
        programAddress,
        ({ logs, err, signature }) => {
            if (err) return;

            if (logs && logs.some(log => log.includes(searchInstruction))) {
                console.log("Signature for 'initialize2':", `https://explorer.solana.com/tx/${signature}`);
                fetchRaydiumMints(signature, connection);
            }
        },
        "finalized"
    );
}

export async function fetchRaydiumMints(txId: string, connection: Connection) {
    try {
        const tx = await connection.getParsedTransaction(
            txId,
            {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });

        //@ts-ignore
        const accounts = (tx?.transaction.message.instructions).find(ix => ix.programId.toBase58() === RAYDIUM_PUBLIC_KEY).accounts as PublicKey[];
    
        if (!accounts) {
            console.log("No accounts found in the transaction.");
            return;
        }

        const tokenAIndex = 8;
        const tokenBIndex = 9;
    
        const tokenAAccount = accounts[tokenAIndex];
        const tokenBAccount = accounts[tokenBIndex];
    
        // this is extra info, if fetch failed or over 20s, it will be null
        let tokenBAnalysis: TokenAnalysis | null = null;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);
            
            tokenBAnalysis = await Promise.race([
                analyzeTokensCreatedByAccount(tokenBAccount.toBase58()),
                new Promise<null>((_, reject) => {
                    controller.signal.addEventListener('abort', () => 
                        reject(new Error('Timeout'))
                    );
                })
            ]);
            
            clearTimeout(timeoutId);
        } catch (error) {
            console.log("Timeout or failed fetching token analysis");
        }

        const timeInfo = getTimeSpent(tokenBAnalysis?.createdAt ?? null);
        // console.log(`New LP Found At: ${utc8}, Time Spent: ${timeSpent}`);
        const tokenAInfo = { Token: "WSOL", CA: tokenAAccount.toBase58() };
        const tokenBInfo = { Token: `${tokenBAnalysis?.symbol ?? 'SPL'}`, CA: tokenBAccount.toBase58() };

        // this is main info, must print
        if(!tokenBAnalysis){
            return [timeInfo, tokenAInfo, tokenBInfo];
        }
        else if(tokenBAnalysis){
            return [timeInfo, tokenAInfo, tokenBInfo, tokenBAnalysis];
        }
    } catch {
        console.log("Error fetching transaction:", txId);
        return;
    }
}
// startConnection(connection, PUMPFUN_GRADUATED, INSTRUCTION_NAME).catch(console.error);