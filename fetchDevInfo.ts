import axios from 'axios';

// interface TokenInfo {
//     mint: string;
//     name: string;
//     symbol: string;
//     creator: string;
//     created_timestamp: number;
//     usd_market_cap: number;
// }

function formatMarketCap(marketCap: number): string {
    if (marketCap >= 1000000000) {
        return (marketCap / 1000000000).toFixed(3) + 'B';
    } else if (marketCap >= 1000000) {
        return (marketCap / 1000000).toFixed(2) + 'M';
    } else {
        return (marketCap / 1000).toFixed(2) + 'K';
    }
}

// get creator address by mintAddress
async function getCreatorAddress(mintAddress: string): Promise<{creator: string, symbol: string, createdAt: number, usd_market_cap: number, twitter: string}> {
    let retries = 0;
    let initialTime = 500;
    while (retries < 5) {
        try {
            const response = await axios.get(`https://frontend-api-v3.pump.fun/coins/${mintAddress}`);
            return {creator: response.data.creator, symbol: response.data.symbol, createdAt: response.data.created_timestamp, usd_market_cap: response.data.usd_market_cap, twitter: response.data.twitter};
        } catch (error) {
            retries++;
            if (retries === 5) {
                console.error('Error fetching creator address');
            }
            console.error(`Error fetching creator address, attempt ${retries}/5`);
            await new Promise(resolve => setTimeout(resolve, initialTime * retries));
        }
    }
    throw new Error('Failed to get creator address after 5 retries');
}

async function getTokensCreatedByAccount(creatorAddress: string): Promise<any[] | null> {
    if(!creatorAddress) {
        // console.error('Creator address is undefined');
        return null;
    }
    let initialTime = 500;
    let retries = 0;
    while (retries < 5) {
        try {
            const response = await axios.get(
                `https://frontend-api-v3.pump.fun/coins/user-created-coins/${creatorAddress}?offset=0&limit=100`
            );
            return response.data;
        } catch (error) {
            retries++;
            if (retries === 5) {
                console.error('Error fetching tokens created by account');
            }
            console.error(`Error fetching tokens created by account, attempt ${retries}/5`);
            await new Promise(resolve => setTimeout(resolve, initialTime * retries + initialTime));
        }
    }
    throw new Error('Failed to get tokens after 5 retries');
}

export interface TokenAnalysis {
    creatorAddress: string;
    symbol: string;
    createdAt: number;
    marketCap: string;
    totalTokens: number;
    largestMarketCapToken: {
        name: string;
        symbol: string;
        marketCap: string;
        // rawMarketCap: number;
    };
    // allTokens: any[];
}

export async function analyzeTokensCreatedByAccount(mintAddress: string): Promise<TokenAnalysis | null> {
    try {
        // Step 1: Get creator address
        const { creator, symbol, createdAt, usd_market_cap } = await getCreatorAddress(mintAddress);

        // Step 2: Get all tokens created by the creator
        const tokens = await getTokensCreatedByAccount(creator);
        if(!tokens) {
            console.error('Failed to get creator address after 5 retries');
            return null;
        }
        // Find the token with the largest market cap
        const largestMarketCapToken = tokens.reduce((max, token) => 
            token.usd_market_cap > max.usd_market_cap ? token : max
        );
        const marketCap = formatMarketCap(usd_market_cap)
        const formattedMarketCap = formatMarketCap(largestMarketCapToken.usd_market_cap);

        return {
            creatorAddress: creator,
            symbol: symbol,
            createdAt: createdAt,
            marketCap: marketCap,
            totalTokens: tokens.length,
            largestMarketCapToken: {
                name: largestMarketCapToken.name,
                symbol: largestMarketCapToken.symbol,
                marketCap: formattedMarketCap,
                // rawMarketCap: largestMarketCapToken.usd_market_cap
            },
            // allTokens: tokens
        };
    } catch (error) {
        console.error('Error in analysis:', error);
        throw error;
    }
}

// Example usage
// analyzeTokensCreatedByAccount('CniPCE4b3s8gSUPhUiyMjXnytrEqUrMfSsnbBjLCpump');
