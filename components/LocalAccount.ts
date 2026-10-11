import { cardPolicies, detectAuraCard, isAuraCard, type AuraCard } from "@/data/cardPolicies"

/** Browser-only account adapter. Replace with server auth before real production use.
 * Passwords are never stored as plaintext, but browser storage is NOT secure authentication.
 */
export type AuraMember = {email:string; name:string; card:AuraCard}
const memberCard = (member: {email:string; card?:unknown}):AuraCard =>
  isAuraCard(member.card) ? member.card : member.email.trim().toLowerCase()==="dara09@naver.com" ? "Amber" : "Velvet"
type StoredMember = AuraMember & {salt:string; hash:string}
const ACCOUNTS="aura_local_accounts_v1"
const SESSION="aura_local_session_v1"
const readAccounts=():StoredMember[]=>{
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNTS)||"[]")
    if (!Array.isArray(saved)) return []
    const accounts:StoredMember[] = saved.map(member => ({...member,card:memberCard(member)}))
    if (saved.some(member => !isAuraCard(member.card))) localStorage.setItem(ACCOUNTS,JSON.stringify(accounts))
    return accounts
  } catch {return []}
}
const hashPassword=async(password:string,salt:string)=>{
  const encoder=new TextEncoder()
  const base=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"])
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:encoder.encode(salt),iterations:150000,hash:"SHA-256"},base,256)
  return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,"0")).join("")
}
export async function registerMember(name:string,email:string,password:string,cardNumber:string):Promise<AuraMember>{
  email=email.trim().toLowerCase();name=name.trim()
  const card = detectAuraCard(cardNumber)
  if (!card) throw Error("16자리 AURA 카드 번호를 확인해 주세요.")
  if(readAccounts().some(a=>a.email===email))throw Error("이미 가입된 이메일입니다.")
  if(!isAuraCard(card) || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8)throw Error("입력한 회원 정보를 확인해 주세요.")
  const salt=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("")
  const record={name,email,card,salt,hash:await hashPassword(password,salt)}
  localStorage.setItem(ACCOUNTS,JSON.stringify([...readAccounts(),record]))
  const signupBonus = cardPolicies[card].signupBonus
  localStorage.setItem(`aura_wallet_${email}`,JSON.stringify({points:signupBonus,history:[{
    id:"signup-bonus-v1",label:`${cardPolicies[card].name} 포인트몰 가입 혜택`,
    detail:"최초 가입 보너스",amount:signupBonus,
    date:new Intl.DateTimeFormat("ko-KR",{month:"2-digit",day:"2-digit",timeZone:"Asia/Seoul"}).format(new Date()),
  }],signupBonusGranted:true}))
  localStorage.setItem(SESSION,JSON.stringify({name,email,card}))
  return {name,email,card}
}
export async function authenticateMember(email:string,password:string):Promise<AuraMember>{
  email=email.trim().toLowerCase()
  const member=readAccounts().find(a=>a.email===email)
  if(!member || await hashPassword(password,member.salt)!==member.hash)throw Error("이메일 또는 비밀번호를 확인해 주세요.")
  const user={name:member.name,email:member.email,card:member.card}
  localStorage.setItem(SESSION,JSON.stringify(user));return user
}
export function currentMember():AuraMember|null{
  try {
    const user=JSON.parse(localStorage.getItem(SESSION)||"null")
    if (!user?.email || !user?.name) return null
    const account=readAccounts().find(member=>member.email===user.email)
    return {name:user.name,email:user.email,card:account?.card ?? memberCard(user)}
  } catch {return null}
}
export function signOut(){localStorage.removeItem(SESSION)}
