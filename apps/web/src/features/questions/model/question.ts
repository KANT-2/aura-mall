export type ProductQuestion = {
  id: string;
  productId: string;
  title: string;
  content: string | null;
  private: boolean;
  mine: boolean;
  answer: string | null;
  answered: boolean;
  answeredAt: string | null;
  version: number;
  created: string;
};
export type QuestionPage = {
  items: ProductQuestion[];
  total: number;
  page: number;
  pageSize: number;
};
