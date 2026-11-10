import { createHash, createPrivateKey, randomUUID, sign } from "node:crypto";
export type AssetAction = "upload" | "list" | "publish" | "archive" | "health";
export function signAssetRequest(
  action: AssetAction,
  body: Uint8Array,
  actor: string,
  privateKeyBase64: string,
) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "EdDSA", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "brasa-server",
      aud: "brasa-media",
      action,
      actor,
      iat: now,
      exp: now + 60,
      jti: randomUUID(),
      bodyHash: createHash("sha256").update(body).digest("hex"),
    }),
  ).toString("base64url");
  const message = `${header}.${payload}`;
  const key = createPrivateKey({
    key: Buffer.from(privateKeyBase64, "base64"),
    type: "pkcs8",
    format: "der",
  });
  return `${message}.${sign(null, Buffer.from(message), key).toString("base64url")}`;
}
