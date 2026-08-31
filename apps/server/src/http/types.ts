export type User = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "agent";
};
