import { keccak256 } from "@ethersproject-xdc/keccak256";
import { toUtf8Bytes } from "@ethersproject-xdc/strings";

export function id(text: string): string {
    return keccak256(toUtf8Bytes(text));
}
