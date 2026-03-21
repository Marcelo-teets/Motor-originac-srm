import { createServer } from "node:http";

import { createAppHandler, createRepository } from "./app";

const repository = createRepository();
const server = createServer(createAppHandler(repository));
const port = Number(process.env.PORT ?? 3000);

server.listen(port, () => {
  console.log(`Motor Originação SRM API running at http://localhost:${port}`);
});
