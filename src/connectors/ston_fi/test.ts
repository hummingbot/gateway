import { mnemonicToWalletKey } from '@ton/crypto';

const mnemonic = "ramp diet proof curve admit steak gospel jump twelve cigar clean inmate victory asthma change random left model conduct stay real any disease metal"

const mnemonics = Array.from(
    { length: 24 },
    (_, i) => `${mnemonic} ${i + 1}`
);
mnemonicToWalletKey(mnemonics).then(e => {
    console.log(e.secretKey.toString());
});
