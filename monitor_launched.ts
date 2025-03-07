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

async function fetchRaydiumMints(txId: string, connection: Connection) {
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
        
        const options = {
            timeZone: "Asia/Shanghai",
            hour12: false,
        };
        const utc8 = new Date().toLocaleString('en-US',options);

        const tokenAIndex = 8;
        const tokenBIndex = 9;
    
        const tokenAAccount = accounts[tokenAIndex];
        const tokenBAccount = accounts[tokenBIndex];
    
        // this is extra info, if fetch failed or over 10s, it will be null
        let tokenBAnalysis: TokenAnalysis | null = null;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
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

        const displayData = [
            { Token: "WSOL", CA: tokenAAccount.toBase58() },
            { Token: `${tokenBAnalysis?.symbol ?? 'SPL'}`, CA: tokenBAccount.toBase58() } 
        ];
        console.log(`New LP Found At: ${utc8}, Time Spent: ${tokenBAnalysis?.createdAt ? (() => {
            const createdTime = new Date(tokenBAnalysis.createdAt).toLocaleString('en-US', {timeZone: 'Asia/Shanghai'});
            const diffMs = Date.now() - tokenBAnalysis.createdAt;
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            return `${hours}h ${minutes}m (Created at ${createdTime})`;
        })() : 'N/A'}`);
        
        // this is main info, must print
        if(!tokenBAnalysis){
            console.table(displayData);
            console.log("Timeout or failed fetching dev info");
        }
        else if(tokenBAnalysis){
            console.table([
                { Key: "Market Cap", Value: tokenBAnalysis.marketCap },
                { Key: "WSOL", Value: tokenAAccount.toBase58() },
                { Key: `${tokenBAnalysis.symbol}`, Value: tokenBAccount.toBase58() },
                { Key: "Creator", Value: tokenBAnalysis.creatorAddress },
                { Key: "Tokens Created", Value: tokenBAnalysis.totalTokens },
                { Key: "Best Token Name", Value: tokenBAnalysis.largestMarketCapToken.name },
                { Key: "Best Token MC", Value: tokenBAnalysis.largestMarketCapToken.marketCap }
            ]);
        }
    } catch {
        console.log("Error fetching transaction:", txId);
        return;
    }
}

startConnection(connection, PUMPFUN_GRADUATED, INSTRUCTION_NAME).catch(console.error);