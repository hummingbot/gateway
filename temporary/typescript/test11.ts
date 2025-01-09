// npx tsx temporary/typescript/test11.ts

async function main() {
    const base64String = "eyJxdWVyeUlkIjoxMDAwMDAwMDA1NDM4OTUsInJvdXRlckFkZHJlc3MiOiJFUUIzbmN5QlVUalpVQTVFbkZLUjVfRW5PTUk5VjF0VEVBQVBhaVU3MWdjNFRpVXQifQ=="
    const decodedString = Buffer.from(base64String, 'base64url').toString('utf-8');
    const obj = JSON.parse(decodedString);

    console.log(obj)
}

main();
