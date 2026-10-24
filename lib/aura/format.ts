export const money = (v: number | null) =>
  v === null ? "가격 확인 중" : v.toLocaleString("ko-KR") + "원";
