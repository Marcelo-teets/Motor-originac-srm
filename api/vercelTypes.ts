export type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
};

export type VercelResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => VercelResponse;
  end: (body?: unknown) => VercelResponse;
};
