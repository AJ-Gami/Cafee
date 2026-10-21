import type { StaffMember, StaffRole } from '../types';

export interface StaffRoleDef {
  role: StaffRole;
  name: string;
  description: string;
  wageRangeSen: readonly [number, number];
  ordersPerHourRange: readonly [number, number];
  hireFeeSen: number;
}

export const STAFF_ROLES: Record<StaffRole, StaffRoleDef> = {
  barista: {
    role: 'barista',
    name: 'Barista',
    description: 'Membancuh minuman. Kapasiti dipertingkat oleh mesin espreso.',
    wageRangeSen: [8_500, 11_000],
    ordersPerHourRange: [7, 10],
    hireFeeSen: 8_000,
  },
  cashier: {
    role: 'cashier',
    name: 'Juruwang',
    description: 'Mengambil pesanan dan membantu di kaunter.',
    wageRangeSen: [6_500, 8_000],
    ordersPerHourRange: [4, 6],
    hireFeeSen: 5_000,
  },
};

/** Fictional names reflecting Malaysia's diversity. */
export const STAFF_NAMES: readonly string[] = [
  'Mei Ling',
  'Hafiz',
  'Kavitha',
  'Nurul',
  'Ravi',
  'Jia Hui',
  'Farah',
  'Daniel',
  'Siti',
  'Arjun',
  'Wei Jie',
  'Aisyah',
  'Syafiq',
  'Priya',
  'Ming',
  'Izzati',
];

export const STARTING_STAFF: StaffMember = {
  id: 'staff-founder',
  name: 'Aiman',
  role: 'barista',
  wageSen: 9_000,
  ordersPerHour: 8,
  hiredDay: 1,
};
