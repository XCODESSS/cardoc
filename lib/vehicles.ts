import { getAuthState } from './auth';
import { readOfflineIndex, writeOfflineIndex } from './offline-index';
import { getSupabaseClient } from './supabase';
import type { Vehicle } from '../types/vehicle';
import { vehicleInputSchema, type VehicleInput } from '../validation/vehicle';

type VehicleRow = {
  id: string; user_id: string; nickname: string; registration_number: string;
  manufacturer: string | null; model: string | null; year: number | null;
  created_at: string; updated_at: string;
};

function requireIdentity() {
  const auth = getAuthState();
  if (auth.status !== 'signedIn' || !auth.userId) throw new Error('Sign in to manage vehicles.');
  const client = getSupabaseClient();
  if (!client) throw new Error('Cardoc is not configured for cloud storage.');
  return { userId: auth.userId, client };
}

function mapVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id, userId: row.user_id, nickname: row.nickname,
    registrationNumber: row.registration_number, manufacturer: row.manufacturer,
    model: row.model, year: row.year, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function saveVehicles(userId: string, vehicles: Vehicle[]) {
  const current = await readOfflineIndex(userId);
  await writeOfflineIndex(userId, { ...current, vehicles });
}

async function upsertLocal(userId: string, vehicle: Vehicle) {
  const current = await readOfflineIndex(userId);
  await writeOfflineIndex(userId, {
    ...current,
    vehicles: [vehicle, ...current.vehicles.filter((item) => item.id !== vehicle.id)],
  });
}

export async function listVehicles(userId: string): Promise<Vehicle[]> {
  const identity = requireIdentity();
  if (userId !== identity.userId) throw new Error('Vehicle owner mismatch.');
  const { data, error } = await identity.client.from('vehicles').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const vehicles = ((data ?? []) as VehicleRow[]).map(mapVehicle);
  await saveVehicles(userId, vehicles);
  return vehicles;
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  const { userId, client } = requireIdentity();
  const { data, error } = await client.from('vehicles').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapVehicle(data as VehicleRow) : null;
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  const { userId, client } = requireIdentity();
  const parsed = vehicleInputSchema.parse(input);
  const { data, error } = await client.from('vehicles').insert({
    user_id: userId, nickname: parsed.nickname, registration_number: parsed.registrationNumber,
    manufacturer: parsed.manufacturer ?? null, model: parsed.model ?? null, year: parsed.year ?? null,
  }).select('*').single();
  if (error) throw new Error(error.message);
  const vehicle = mapVehicle(data as VehicleRow);
  await upsertLocal(userId, vehicle);
  return vehicle;
}

export async function updateVehicle(id: string, input: VehicleInput): Promise<Vehicle> {
  const { userId, client } = requireIdentity();
  const parsed = vehicleInputSchema.parse(input);
  const { data, error } = await client.from('vehicles').update({
    nickname: parsed.nickname, registration_number: parsed.registrationNumber,
    manufacturer: parsed.manufacturer ?? null, model: parsed.model ?? null, year: parsed.year ?? null,
  }).eq('user_id', userId).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  const vehicle = mapVehicle(data as VehicleRow);
  await upsertLocal(userId, vehicle);
  return vehicle;
}

export async function deleteVehicle(id: string): Promise<void> {
  const { userId, client } = requireIdentity();
  const { count, error: countError } = await client.from('documents').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('vehicle_id', id);
  if (countError) throw new Error(countError.message);
  if (count == null) throw new Error('Could not check this vehicle for documents.');
  if (count > 0) throw new Error('Remove this vehicle’s documents before deleting it.');
  const { data, error } = await client.from('vehicles').delete().eq('user_id', userId).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Vehicle was not found.');
  const current = await readOfflineIndex(userId);
  await writeOfflineIndex(userId, { ...current, vehicles: current.vehicles.filter((vehicle) => vehicle.id !== id) });
}
