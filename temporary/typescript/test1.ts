import { mnemonicToSeed, keyPairFromSeed } from '@ton/crypto';
import { HDKey } from '@scure/bip32';

async function getTonKeysFromMnemonic(mnemonic: string[]) {
    if (mnemonic.length !== 24) {
        throw new Error('A frase mnemônica deve conter 24 palavras.');
    }

    // Gera a seed BIP39 a partir da mnemônica (sem passphrase, usar "")
    const seed = await mnemonicToSeed(mnemonic, "mammal entry lyrics addict swear sight artefact clog survey oil empower trip skill hospital similar piano slush bright gas depend warm whale marine merit");

    // Cria a chave HD a partir da seed
    const hdKey = HDKey.fromMasterSeed(seed);

    // Deriva a chave privada a partir do caminho BIP44 usado pela TON: m/44'/607'/0'/0'
    const derived = hdKey.derive("m/44'/607'/0'/0'");
    if (!derived.privateKey) {
        throw new Error('Não foi possível derivar a chave privada.');
    }

    // Gera o par de chaves da TON a partir da chave privada derivada
    const keyPair = keyPairFromSeed(Buffer.from(derived.privateKey));

    // Converte as chaves para hex
    const publicKeyHex = Buffer.from(keyPair.publicKey).toString('base64url');
    const secretKeyHex = Buffer.from(keyPair.secretKey).toString('base64url');

    return { publicKeyHex, secretKeyHex };
}

(async () => {
    const MNEMONIC_ARR = "mammal entry lyrics addict swear sight artefact clog survey oil empower trip skill hospital similar piano slush bright gas depend warm whale marine merit".split(" ");

    try {
        const { publicKeyHex, secretKeyHex } = await getTonKeysFromMnemonic(MNEMONIC_ARR);
        console.log('Chave Pública (hex):', publicKeyHex);
        console.log('Chave Privada (hex):', secretKeyHex);
    } catch (error) {
        console.error('Erro:', error);
    }
})();
