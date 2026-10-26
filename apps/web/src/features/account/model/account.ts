export type Member = {
  id: string;
  email: string;
  name: string;
  coupon: boolean;
  marketing?: boolean;
};
export type Session = { user: Member | null; guestId: string };
export type Credentials = { email: string; password: string };
export type Registration = Credentials & { name: string; marketing?: boolean };
