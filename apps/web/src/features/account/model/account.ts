export type MemberRole = "member" | "admin";
export type Member = {
  id: string;
  email: string;
  name: string;
  coupon: boolean;
  marketing?: boolean;
  /** Display hint only. Every admin API checks the server-side account role again. */
  role?: MemberRole;
};
export type AccountState = { user: Member | null; guestId: string };
export type Credentials = { email: string; password: string };
export type Registration = Credentials & { name: string; marketing?: boolean };
