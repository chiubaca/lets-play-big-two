import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });
const base64url = (value) => Buffer.from(value, "base64url");
const publicBytes = Buffer.concat([
  Buffer.from([4]),
  base64url(publicJwk.x),
  base64url(publicJwk.y),
]);

console.log(`VAPID_PUBLIC_KEY=${publicBytes.toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${privateJwk.d}`);
