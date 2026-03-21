declare module "node:http" {
  export interface IncomingMessage extends AsyncIterable<string | Uint8Array> {
    method?: string;
    url?: string;
    headers?: Record<string, string | undefined>;
  }

  export interface ServerResponse {
    writeHead(
      statusCode: number,
      headers?: Record<string, string>
    ): ServerResponse;
    end(chunk?: string): void;
  }

  export interface AddressInfo {
    address: string;
    family: string;
    port: number;
  }

  export interface Server {
    listen(port: number, callback?: () => void): void;
    close(callback?: (error?: Error) => void): void;
    address(): AddressInfo | string | null;
  }

  export function createServer(
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  ): Server;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function mkdirSync(
    path: string,
    options?: { recursive?: boolean }
  ): string | undefined;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string, encoding: "utf8"): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean }
  ): void;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}

declare module "node:test" {
  const test: (name: string, fn: () => void | Promise<void>) => void;
  export default test;
}

declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown): void;
    deepEqual(actual: unknown, expected: unknown): void;
    notEqual(actual: unknown, expected: unknown): void;
    match(actual: string, expected: RegExp): void;
  };
  export default assert;
}

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};

declare const console: {
  log(message: string): void;
};

declare function fetch(
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
): Promise<{
  status: number;
  json(): Promise<unknown>;
}>;
