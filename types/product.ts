export interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  imageUrl: string;
  description: string;
  collection: "dew" | "velvet" | "amber";
  volume?: string;
  topNote?: string;
  middleNote?: string;
  baseNote?: string;
  isNew?: boolean;
}