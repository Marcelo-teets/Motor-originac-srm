import { clientes } from '../data/clientes';

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getClientes() {
  await wait();
  return [...clientes];
}
