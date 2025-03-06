import axios from 'axios';

// interface TokenInfo {
//     mint: string;
//     name: string;
//     symbol: string;
//     creator: string;
//     created_timestamp: number;
//     usd_market_cap: number;
// }

async function getCreatorAddress(mintAddress: string): Promise<string> {
    try {
        const response = await axios.get(`https://frontend-api.pump.fun/coins/${mintAddress}`);
        return response.data.creator;
    } catch (error) {
        console.error('Error fetching creator address:', error);
        throw error;
    }
}

async function getTokensCreatedByAccount(creatorAddress: string): Promise<any[]> {
    try {
        const response = await axios.get(
            `https://frontend-api-v3.pump.fun/coins/user-created-coins/${creatorAddress}?offset=0&limit=100`
        );
        return response.data;
    } catch (error) {
        console.error('Error fetching tokens created by account:', error);
        throw error;
    }
}

export interface TokenAnalysis {
    creatorAddress: string;
    totalTokens: number;
    largestMarketCapToken: {
        name: string;
        symbol: string;
        marketCap: string;
        rawMarketCap: number;
    };
    allTokens: any[];
}

export async function analyzeTokensCreatedByAccount(mintAddress: string): Promise<TokenAnalysis> {
    try {
        // Step 1: Get creator address
        const creatorAddress = await getCreatorAddress(mintAddress);

        // Step 2: Get all tokens created by the creator
        const tokens = await getTokensCreatedByAccount(creatorAddress);
        
        // Find the token with the largest market cap
        const largestMarketCapToken = tokens.reduce((max, token) => 
            token.usd_market_cap > max.usd_market_cap ? token : max
        );

        const formattedMarketCap = largestMarketCapToken.usd_market_cap >= 1000000 
            ? (largestMarketCapToken.usd_market_cap / 1000000).toFixed(2) + 'm'
            : (largestMarketCapToken.usd_market_cap / 1000).toFixed(2) + 'k';

        return {
            creatorAddress,
            totalTokens: tokens.length,
            largestMarketCapToken: {
                name: largestMarketCapToken.name,
                symbol: largestMarketCapToken.symbol,
                marketCap: formattedMarketCap,
                rawMarketCap: largestMarketCapToken.usd_market_cap
            },
            allTokens: tokens
        };
    } catch (error) {
        console.error('Error in analysis:', error);
        throw error;
    }
}

// Example usage
// analyzeTokensCreatedByAccount('CniPCE4b3s8gSUPhUiyMjXnytrEqUrMfSsnbBjLCpump');
