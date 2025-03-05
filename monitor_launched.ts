import { Connection, PublicKey } from '@solana/web3.js'
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
    
        const tokenAIndex = 8;
        const tokenBIndex = 9;
    
        const tokenAAccount = accounts[tokenAIndex];
        const tokenBAccount = accounts[tokenBIndex];
    
        const displayData = [
            { "Token": "A", "Account Public Key": tokenAAccount.toBase58() },
            { "Token": "B", "Account Public Key": tokenBAccount.toBase58() }
        ];

        console.log("New LP Found");
        console.table(displayData);
    
    } catch {
        console.log("Error fetching transaction:", txId);
        return;
    }
}

startConnection(connection, PUMPFUN_GRADUATED, INSTRUCTION_NAME).catch(console.error);
