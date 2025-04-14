import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';

async function getBasicTokenInfo(tokenAddress: string) {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const mintPubkey = new PublicKey(tokenAddress);

  const mintInfo = await getMint(connection, mintPubkey);

  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(), mintPubkey.toBuffer()],
    new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
  );

  const metadataAccount = await connection.getAccountInfo(metadataPda);
  if (!metadataAccount) {
    return { name: '', symbol: '', decimals: mintInfo.decimals };
  }

  let name = '', symbol = '';
  try {
    const data = metadataAccount.data;
    const nameLength = data.readUInt32LE(65); // name 长度（偏移 65）
    name = data.slice(69, 69 + nameLength).toString('utf8').replace(/\0/g, '');
    const symbolLength = data.readUInt32LE(69 + nameLength); // symbol 长度
    symbol = data.slice(73 + nameLength, 73 + nameLength + symbolLength).toString('utf8').replace(/\0/g, '');
  } catch {
    return { name: '', symbol: '', decimals: mintInfo.decimals };
  }

  return { name, symbol, decimals: mintInfo.decimals };
}

getBasicTokenInfo('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v').then(data => {
    console.log(data);
})