export interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt: Date;
  updatedAt: Date;
  roles: Role[];
  memberships?: any[]; // Add proper type if needed
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  role: string;
  clientId?: { _id: string };
  harborId?: string;
}

export interface Permission {
  id: string;
  name: string;
}
