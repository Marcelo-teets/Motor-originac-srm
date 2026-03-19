declare module "node:http" {
  export interface IncomingMessage {
    method?: string;
    url?: string;
  }

  export interface ServerResponse {
    writeHead(
      statusCode: number,
      headers?: Record<string, string>
    ): ServerResponse;
    end(chunk?: string): void;
  }

  export interface Server {
    listen(port: number, callback?: () => void): void;
  }

  export function createServer(
    handler: (request: IncomingMessage, response: ServerResponse) => void
  ): Server;
}

declare const process: {
  env: Record<string, string | undefined>;
};

declare const console: {
  log(message: string): void;
};
