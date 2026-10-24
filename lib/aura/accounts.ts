import { isRecord } from "./validation";

export type Member = {
  email: string;
  name: string;
  coupon: boolean;
  marketing?: boolean;
};
type Account = Member & { salt: string; hash: string };
const ACCOUNTS = "aura_members_v2";
export const SESSION = "aura_session_v2";
function isAccount(value: unknown): value is Account {
  return isRecord(value) &&
    typeof value.email === "string" && /^\S+@\S+\.\S+$/.test(value.email) &&
    typeof value.name === "string" && !!value.name.trim() &&
    typeof value.coupon === "boolean" &&
    (value.marketing === undefined || typeof value.marketing === "boolean") &&
    typeof value.salt === "string" && /^[\da-f]{32}$/i.test(value.salt) &&
    typeof value.hash === "string" && /^[\da-f]{64}$/i.test(value.hash);
}

function member(account: Account): Member {
  return {
    name: account.name,
    email: account.email,
    coupon: account.coupon,
    marketing: account.marketing,
  };
}

function records(): Account[] {
  try {
    const x = JSON.parse(localStorage.getItem(ACCOUNTS) || "[]");
    return Array.isArray(x) ? x.filter(isAccount) : [];
  } catch {
    return [];
  }
}
async function hash(password: string, salt: string) {
  if (!crypto.subtle)
    throw Error("안전한 연결(HTTPS 또는 localhost)에서 다시 시도해 주세요.");
  const e = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    e.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: e.encode(salt),
      iterations: 150000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export function current(): Member | null {
  try {
    const x = JSON.parse(localStorage.getItem(SESSION) || "null");
    if (!isRecord(x) || typeof x.email !== "string") return null;
    const account = records().find((a) => a.email === x.email);
    return account ? member(account) : null;
  } catch {
    return null;
  }
}
export function logout() {
  localStorage.removeItem(SESSION);
}
export async function register(
  name: string,
  email: string,
  password: string,
  marketing = false,
) {
  email = email.trim().toLowerCase();
  if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8)
    throw Error("회원 정보를 확인해 주세요.");
  if (records().some((x) => x.email === email))
    throw Error("이미 가입된 이메일입니다.");
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  const account = {
    name: name.trim(),
    email,
    salt,
    hash: await hash(password, salt),
    coupon: true,
    marketing,
  };
  // Hashing yields to other submissions; check again before writing the account.
  if (records().some((x) => x.email === email))
    throw Error("이미 가입된 이메일입니다.");
  localStorage.setItem(ACCOUNTS, JSON.stringify([...records(), account]));
  const user = member(account);
  localStorage.setItem(SESSION, JSON.stringify(user));
  return user;
}
export async function login(email: string, password: string) {
  const a = records().find((x) => x.email === email.trim().toLowerCase());
  if (!a || (await hash(password, a.salt)) !== a.hash)
    throw Error("이메일 또는 비밀번호를 확인해 주세요.");
  const user = member(a);
  localStorage.setItem(SESSION, JSON.stringify(user));
  return user;
}
