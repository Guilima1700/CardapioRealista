import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
} from "node:crypto";
const bootstrap = JSON.parse(
  readFileSync(".tools/media-bootstrap.json", "utf8"),
);
let env = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
function get(name) {
  return new RegExp(`^${name}=(.*)$`, "m").exec(env)?.[1]?.trim();
}
function set(name, value) {
  const expression = new RegExp(`^${name}=.*$`, "m");
  env = expression.test(env)
    ? env.replace(expression, `${name}=${value}`)
    : env + `\n${name}=${value}\n`;
}
const previousUrl = get("NEXT_PUBLIC_SUPABASE_URL");
if (previousUrl && previousUrl !== bootstrap.url)
  throw new Error(
    "A URL existente pertence a outro projeto. Nenhuma configuração foi alterada.",
  );
const existing = get("BRASA_ASSET_PRIVATE_KEY");
const privateKey = existing
  ? createPrivateKey({
      key: Buffer.from(existing, "base64"),
      format: "der",
      type: "pkcs8",
    })
  : generateKeyPairSync("ed25519").privateKey;
const publicKey = createPublicKey(privateKey).export({ format: "jwk" });
if (!existing)
  set(
    "BRASA_ASSET_PRIVATE_KEY",
    privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  );
set("NEXT_PUBLIC_SUPABASE_URL", bootstrap.url);
set("NEXT_PUBLIC_SUPABASE_ANON_KEY", bootstrap.publishableKey);
set("ASSET_BACKEND", "supabase");
writeFileSync(".env.local", env.trimEnd() + "\n");
mkdirSync("supabase/functions/brasa-media", { recursive: true });
writeFileSync(
  "supabase/functions/brasa-media/public-key.json",
  JSON.stringify(publicKey, null, 2) + "\n",
);
console.log(
  "Mídia configurada. Chave privada restrita a .env.local; apenas a chave pública será implantada. Login e backend dos pedidos preservados.",
);
