import "server-only";
import { cookies } from "next/headers";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { backend, localDb, listStaff } from "./db";
import { AppError } from "../validation";
import type { Role } from "../types";
const developmentSecret = randomBytes(32).toString("hex");
function secret() {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production")
    throw new AppError(
      "Configure SESSION_SECRET com pelo menos 32 caracteres.",
      503,
    );
  return developmentSecret;
}
type Session = {
  id: string;
  role: Role;
  email: string;
  exp: number;
  accessToken?: string;
  refreshToken?: string;
};
function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}
export async function saveSession(session: Omit<Session, "exp">) {
  const data = Buffer.from(
    JSON.stringify({ ...session, exp: Date.now() + 8 * 3600000 }),
  ).toString("base64url");
  (await cookies()).set("brasa_staff", `${data}.${sign(data)}`, {
    httpOnly: true,
    secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 3600,
  });
}
export async function requireStaff(admin = false): Promise<Session> {
  const value = (await cookies()).get("brasa_staff")?.value;
  if (!value) throw new AppError("Entre com sua conta para continuar.", 401);
  const [data, signature] = value.split(".");
  const expected = sign(data);
  const a = Buffer.from(signature || ""),
    b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new AppError("Sessão inválida.", 401);
  let session: Session;
  try {
    session = JSON.parse(Buffer.from(data, "base64url").toString());
  } catch {
    throw new AppError("Sessão inválida.", 401);
  }
  if (session.exp < Date.now())
    throw new AppError("Sua sessão expirou. Entre novamente.", 401);
  const staff = (await listStaff()).find(
    (s) => s.id === session.id && s.active,
  );
  if (!staff || (admin && staff.role !== "admin"))
    throw new AppError("Você não tem permissão para esta operação.", 403);
  return { ...session, role: staff.role };
}
export async function login(email: string, password: string) {
  if (backend === "sqlite") {
    const row = localDb()
      .prepare("SELECT * FROM staff_users WHERE email=? AND active=1")
      .get(email.toLowerCase()) as
      | { id: string; email: string; role: Role; password_hash: string }
      | undefined;
    const [salt, hash] = (
      row?.password_hash ||
      "00000000000000000000000000000000:" + "00".repeat(64)
    ).split(":");
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    if (
      !row ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new AppError("E-mail ou senha incorretos.", 401);
    await saveSession({ id: row.id, email: row.email, role: row.role });
    return { role: row.role };
  }
  // Isolated client: signing in must never overwrite the service-role client's auth state.
  const { createClient } = await import("@supabase/supabase-js");
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await auth.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session)
    throw new AppError("E-mail ou senha incorretos.", 401);
  const staff = (await listStaff()).find(
    (s) => s.id === data.user.id && s.active,
  );
  if (!staff) throw new AppError("Acesso não autorizado.", 403);
  await saveSession({
    id: staff.id,
    email: staff.email,
    role: staff.role,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
  return { role: staff.role };
}
export async function realtimeToken() {
  const session = await requireStaff();
  if (backend === "sqlite") return null;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.refreshSession({
    refresh_token: session.refreshToken!,
  });
  if (error || !data.session)
    throw new AppError("Entre novamente para reconectar.", 401);
  await saveSession({
    ...session,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
  return data.session.access_token;
}
