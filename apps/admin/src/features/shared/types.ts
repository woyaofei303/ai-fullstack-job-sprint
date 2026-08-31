export type User = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "agent";
};

export type Tab =
  | "overview"
  | "inbox"
  | "contacts"
  | "ai"
  | "knowledge"
  | "channels"
  | "team"
  | "settings";

export type Conversation = {
  id: string;
  status: string;
  contactName: string;
  channelName: string;
  channelType: string;
  aiAgentName: string;
  preview: string;
  lastMessageAt: string;
};

export type Message = {
  id: string;
  sender: string;
  text: string;
  createdAt: string;
  senderName?: string;
};

export type Row = Record<string, unknown>;
