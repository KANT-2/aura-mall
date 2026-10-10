/** Browser-only account adapter. Replace with server auth before real production use.
 * Passwords are never stored as plaintext, but browser storage is NOT secure authentication.
 */
export type AuraMember = {email:string; name:string}
type StoredMember = AuraMember & {salt:string; hash:string}
const ACCOUNTS="aura_local_accounts_v1"
const SESSION="aura_local_session_v1"
const readAccounts=():StoredMember[]=>{try{return JSON.parse(localStorage.getItem(ACCOUNTS)||"[]")}catch{return []}}
const hashPassword=async(password:string,salt:string)=>{
  const encoder=new TextEncoder()
  const base=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"])
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:encoder.encode(salt),iterations:150000,hash:"SHA-256"},base,256)
  return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,"0")).join("")
}
export async function registerMember(name:string,email:string,password:string):Promise<AuraMember>{
  email=email.trim().toLowerCase();name=name.trim()
  if(readAccounts().some(a=>a.email===email))throw Error("이미 가입된 이메일입니다.")
  if(!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8)throw Error("입력한 회원 정보를 확인해 주세요.")
  const salt=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("")
  const record={name,email,salt,hash:await hashPassword(password,salt)}
  localStorage.setItem(ACCOUNTS,JSON.stringify([...readAccounts(),record]))
  localStorage.setItem(SESSION,JSON.stringify({name,email}))
  return {name,email}
}
export async function authenticateMember(email:string,password:string):Promise<AuraMember>{
  email=email.trim().toLowerCase()
  const member=readAccounts().find(a=>a.email===email)
  if(!member || await hashPassword(password,member.salt)!==member.hash)throw Error("이메일 또는 비밀번호를 확인해 주세요.")
  const user={name:member.name,email:member.email}
  localStorage.setItem(SESSION,JSON.stringify(user));return user
}
export function currentMember():AuraMember|null{try{const user=JSON.parse(localStorage.getItem(SESSION)||"null");return user?.email&&user?.name?user:null}catch{return null}}
export function signOut(){localStorage.removeItem(SESSION)}
