export type Role = "platform" | "admin" | "employee" | "viewer";

export type OrgStatus = "pending" | "active" | "suspended";

export interface Organization {
  id: string;
  name: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  job_title: string | null;
  role: Role;
  org_id: string | null;
  created_at: string;
}
