import fs from 'fs';
import path from 'path';

// Define the interface for the input data
interface WalletData {
    trackedWalletAddress: string;
    name: string;
    emoji: string;
    alertsOn: boolean;
}

// Read the input file
const inputFile = path.join(__dirname, 'axiom_wallet_data.json');
const outputFile = path.join(__dirname, 'axiom_wallet.json');

try {
    // Read and parse the input JSON
    const inputData: WalletData[] = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
    
    // Transform the data into the desired format
    const transformedData = inputData.map(item => item.trackedWalletAddress);
    
    // Write the transformed data to the output file
    fs.writeFileSync(outputFile, JSON.stringify(transformedData, null, 2));
    
    console.log('Data successfully transformed and written to axiom_wallet.json');
    
    // If you want to create a Map directly:
    const walletMap = new Set<string>();
    inputData.forEach(item => {
        walletMap.add(item.trackedWalletAddress);
    });
    
    console.log('Map created:', walletMap);
} catch (error) {
    console.error('Error processing files:', error);
}