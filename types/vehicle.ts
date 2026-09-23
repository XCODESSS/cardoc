export interface Vehicle {
  id: string;
  userId: string;
  nickname: string;
  registrationNumber: string;
  manufacturer: string | null;
  model: string | null;
  year: number | null;
  createdAt: string;
  updatedAt: string;
}
