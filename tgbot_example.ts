import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { fetchRaydiumMints } from './monitor_launched';
import { Connection, PublicKey } from '@solana/web3.js';
import { TokenAnalysis } from './fetchDevInfo';
dotenv.config()

const RAYDIUM_PUBLIC_KEY = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const Pumpfun_Migration = "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg"
const HTTP_URL = `https://mainnet.helius-rpc.com/?api-key=${'HELIUS_API_KEY'}`;
const WSS_URL = `wss://mainnet.helius-rpc.com/?api-key=${'HELIUS_API_KEY'}`;
const PUMPFUN_GRADUATED = new PublicKey(Pumpfun_Migration)
const RAYDIUM = new PublicKey(RAYDIUM_PUBLIC_KEY);
const INSTRUCTION_NAME = "initialize2";
/**
 * helius rpc response time is 14~15s
 * next time I'll use solana mainnet rpc    
 */
const connection = new Connection(HTTP_URL, {
    wsEndpoint: WSS_URL
});

// Replace with your bot token from BotFather
const token = process.env.TELEGRAM_BOT_TOKEN || '';
const groupId = process.env.TELEGRAM_GROUP_ID || '';

// Create a bot instance
const bot = new TelegramBot(token, { polling: true });

// Add connection state management
let isMonitoring = false;
let currentConnection: any = null;

async function startConnection(connection: Connection, programAddress: PublicKey, searchInstruction: string): Promise<void> {
    if (isMonitoring) {
        console.log("Already monitoring");
        return;
    }

    isMonitoring = true;
    console.log("Starting monitoring for program:", programAddress.toString());
    
    // Start monitoring asynchronously
    currentConnection = connection.onLogs(
        programAddress,
        ({ logs, err, signature }) => {
            if (err) return;

            if (logs && logs.some(log => log.includes(searchInstruction))) {
                // Process transaction asynchronously
                fetchRaydiumMints(signature, connection)
                    .then(result => {
                        if (!result) return;
                        
                        const [timeInfo, tokenAInfo, tokenBInfo, tokenAnalysis] = result as [
                            { utc8: string; timeSpent: string },
                            { Token: string; CA: string },
                            { Token: string; CA: string },
                            TokenAnalysis | undefined
                        ];
                        
                        let telegramMessage = `🆕 New LP Found!\n\n`;
                        telegramMessage += `⏰ Time: ${timeInfo.utc8}\n`;
                        telegramMessage += `⏱️ Time Spent: ${timeInfo.timeSpent}\n\n`;

                        if (tokenAnalysis) {
                            telegramMessage += `📊 Market Cap: ${tokenAnalysis.marketCap}\n`;
                            telegramMessage += `💎 Symbol: ${tokenAnalysis.symbol}\n`; 
                            telegramMessage += `🔗 Token CA: ${tokenBInfo.CA}\n`;
                            telegramMessage += `👤 Creator: ${tokenAnalysis.creatorAddress}\n`;
                            telegramMessage += `📈 Total Tokens Created: ${tokenAnalysis.totalTokens}\n`;
                            telegramMessage += `🏆 Best Token: ${tokenAnalysis.largestMarketCapToken.name}\n`;
                            telegramMessage += `💰 Best Token MC: ${tokenAnalysis.largestMarketCapToken.marketCap}\n`;
                        } else {
                            telegramMessage += `⚠️ Token Analysis: Timeout or failed\n`;
                            telegramMessage += `🔗 Token CA: ${tokenBInfo.CA}\n`;
                        }

                        // Send message without awaiting
                        bot.sendMessage(groupId, telegramMessage, { parse_mode: 'HTML' }).catch(error => {
                            console.error('Error sending message:', error);
                        });
                    })
                    .catch(error => {
                        console.error('Error processing transaction:', error);
                    });
            }
        },
        "finalized"
    );
}

function stopConnection() {
    if (!isMonitoring || !currentConnection) {
        return;
    }

    isMonitoring = false;
    currentConnection.removeAllListeners();
    currentConnection = null;
    console.log("Stopped monitoring");
}

// Handle /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Hello! I am your Telegram bot. How can I help you?');
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
Available commands:
/start - Start the bot
/help - Show this help message
/broadcast <message> - Broadcast message to the group
/echo <message> - Echo back your message
/on - Start monitoring for new LPs
/off - Stop monitoring for new LPs
    `;
    bot.sendMessage(chatId, helpMessage);
});

// Handle /broadcast command
bot.onText(/\/broadcast (.+)/, (msg, match) => {
    if (!match) return;
    
    const chatId = msg.chat.id;
    const message = match[1];
    
    // Check if the message is from the group
    if (msg.chat.id.toString() === groupId) {
        bot.sendMessage(chatId, `📢 Broadcast: ${message}`);
    } else {
        bot.sendMessage(chatId, 'This command can only be used in the group.');
    }
});

// Handle /echo command
bot.onText(/\/echo (.+)/, (msg, match) => {
    if (!match) return;
    
    const chatId = msg.chat.id;
    const message = match[1];
    bot.sendMessage(chatId, message);
});

// Handle /on command
bot.onText(/\/on/, (msg) => {
    const chatId = msg.chat.id;
    if (isMonitoring) {
        bot.sendMessage(chatId, 'Monitoring is already running');
        return;
    }
    
    // Start monitoring asynchronously
    startConnection(connection, PUMPFUN_GRADUATED, INSTRUCTION_NAME)
        .then(() => {
            bot.sendMessage(chatId, 'Started monitoring for new pumpFun launched LPs');
        })
        .catch(error => {
            console.error('Error starting monitoring:', error);
            bot.sendMessage(chatId, 'Failed to start monitoring');
        });
});

// Handle /off command
bot.onText(/\/off/, (msg) => {
    const chatId = msg.chat.id;
    if (!isMonitoring) {
        bot.sendMessage(chatId, 'Monitoring is already stopped');
        return;
    }
    
    stopConnection();
    bot.sendMessage(chatId, 'Stopped monitoring for new LPs');
});

// Handle regular messages
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Ignore commands
    if (text && !text.startsWith('/')) {
        console.log(`Received message: ${text} from chat ${chatId}`);
    }
});

// Handle errors
bot.on('polling_error', (error) => {
    console.log('Polling error:', error);
});

// Remove the automatic start
console.log('Telegram bot is running...');