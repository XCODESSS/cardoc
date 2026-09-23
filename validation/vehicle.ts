import { z } from 'zod';

const optionalName = z.string().trim().transform((value) => value || null).nullable().optional();

export const vehicleInputSchema = z.object({
  nickname: z.string().trim().min(1, 'Enter a vehicle nickname.'),
  registrationNumber: z.string().trim().min(4, 'Registration number needs at least 4 characters.'),
  manufacturer: optionalName,
  model: optionalName,
  year: z.number().int().min(1886).max(new Date().getFullYear() + 1).nullable().optional(),
});

export type VehicleInput = z.input<typeof vehicleInputSchema>;
export type ParsedVehicleInput = z.output<typeof vehicleInputSchema>;
