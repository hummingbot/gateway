// npx tsx temporary/typescript/test08.ts


import { TonApiClient } from '@ton-api/client';
import { Address } from '@ton/core';

// Initialize the TonApi
const ta = new TonApiClient();

const event = "4+YA7Y+K8n3nKU4fvUcaCfVpGDh1yf+jXWvUVW24JN8="

// Use the API
async function fetchAccountEvents() {
    const events = await ta.events.getEvent(event)
    
    console.log('Account events:', events)
}

fetchAccountEvents();