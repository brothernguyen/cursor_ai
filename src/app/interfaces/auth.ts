export interface SysAdminUser {
  email: string,
  password: string,
  role: string
}
export interface Company {
  id?: string
  name: string
  logoUrl?: any
  address: string
  phone?: any
  industry: string
  status: string
  users?: User[]
}

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  status: string
}

export interface Room {
  name: string
  capacity: number
  availableFrom: string
  availableTo: string
  location: string
  timezone: "UTC"
}

