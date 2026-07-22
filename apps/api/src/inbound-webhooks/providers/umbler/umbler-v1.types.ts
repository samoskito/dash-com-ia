export type UmblerV1Ad = {
  ConversionSource?: unknown;
  SourceUrl?: string | null;
  Description?: string | null;
  Title?: string | null;
  ThumbnailUrl?: string | null;
  MediaUrl?: string | null;
  SourceType?: string | null;
  SourceId?: string | null;
  FileId?: string | null;
  CTWaCLId?: string | null;
};

export type UmblerV1LastMessage = {
  Id: string;
  Content?: string | null;
  MessageType?: string | null;
  SentByOrganizationMember?: unknown | null;
  BotInstance?: unknown | null;
  IsPrivate: boolean;
  Source: string;
  EventAtUTC: string | null;
  Ad?: UmblerV1Ad | null;
};

export type UmblerV1Contact = {
  Id: string;
  PhoneNumber: string;
  Name?: string | null;
};

export type UmblerV1Channel = {
  Id: string;
  PhoneNumber: string;
  Name: string | null;
};

export type UmblerV1ChatContent = {
  Organization: {
    Id: string;
  };
  Contact: UmblerV1Contact;
  Channel: UmblerV1Channel;
  LastMessage: UmblerV1LastMessage;
  FirstContactMessage?: {
    Id: string;
    EventAtUTC?: string | null;
  } | null;
};

export type UmblerV1Envelope = {
  Type: string;
  EventDate: string;
  Payload: {
    Type: string;
    Content: UmblerV1ChatContent;
  };
  EventId: string;
};
