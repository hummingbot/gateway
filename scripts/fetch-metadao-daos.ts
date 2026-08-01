/**
 * Fetch all MetaDAO pools/DAOs and save to a JSON file.
 * Run with: npx ts-node scripts/fetch-metadao-daos.ts
 * Requires server running: pnpm start --passphrase=test --dev
 */

const BASE_URL = 'http://localhost:15888';
const DELAY_MS = 20000; // Delay between requests (20s to avoid rate limits)

// Use any type since we want to save all fields from the API response
type DaoInfo = Record<string, unknown>;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDaoList(): Promise<string[]> {
  const response = await fetch(`${BASE_URL}/connectors/metadao/futarchy/daos`);
  if (!response.ok) {
    throw new Error(`Failed to fetch DAO list: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.daos;
}

async function fetchDaoInfo(address: string): Promise<DaoInfo | null> {
  try {
    const url = `${BASE_URL}/connectors/metadao/futarchy/dao-info?pool=${encodeURIComponent(address)}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch DAO info for ${address}: ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching DAO info for ${address}:`, error);
    return null;
  }
}

async function saveToken(address: string): Promise<void> {
  try {
    const url = `${BASE_URL}/tokens/save/${encodeURIComponent(address)}?chainNetwork=solana-mainnet-beta`;
    const response = await fetch(url, { method: 'POST' });
    if (!response.ok) {
      console.warn(`  -> token save skipped for ${address}: ${response.status}`);
      return;
    }
    const data = await response.json();
    console.log(`  -> token saved/found: ${data.token?.symbol || address}`);
  } catch (error) {
    console.warn(`  -> token save failed for ${address}: ${error}`);
  }
}

async function main() {
  console.log('Fetching MetaDAO DAO list...');
  const allDaos = await fetchDaoList();
  const existingDaos = [...new Set(allDaos)];
  console.log(`Found ${allDaos.length} DAOs (${existingDaos.length} distinct)`);

  const daos: DaoInfo[] = [];
  const seenPools = new Set<string>();
  let successCount = 0;
  let failCount = 0;
  let duplicateCount = allDaos.length - existingDaos.length;

  for (let i = 0; i < existingDaos.length; i++) {
    const address = existingDaos[i];
    if (seenPools.has(address)) {
      duplicateCount++;
      continue;
    }
    seenPools.add(address);

    console.log(`[${i + 1}/${existingDaos.length}] Fetching ${address.slice(0, 8)}...`);

    const info = await fetchDaoInfo(address);
    if (info) {
      daos.push(info);
      successCount++;
      console.log(`  -> ${info.baseSymbol}/${info.quoteSymbol} (${info.state})`);
      await saveToken(String(info.baseMint));
      await saveToken(String(info.quoteMint));
    } else {
      failCount++;
    }

    // Rate limit delay
    if (i < existingDaos.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Sort by baseSymbol
  daos.sort((a, b) => String(a.baseSymbol || '').localeCompare(String(b.baseSymbol || '')));

  // Save to file
  const outputPath = './src/connectors/metadao/daos.json';
  const fs = await import('fs');

  fs.writeFileSync(outputPath, JSON.stringify(daos, null, 2));

  console.log('\n=== Summary ===');
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Skipped duplicates: ${duplicateCount}`);
  console.log(`Distinct pools saved: ${daos.length}`);
  console.log(`Saved to: ${outputPath}`);
}

main().catch(console.error);
