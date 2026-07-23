import { getGlobalSoulStore } from '../db/program';

const PAGE_SIZE = 10;

interface AgentRecord {
  id: string;
  name: string;
  programPath: string;
}

/**
 * Fetch all souls (agents) from the GlobalSoulStore.
 */
export function fetchAgents(): AgentRecord[] {
  const store = getGlobalSoulStore();
  return store.list().map(s => ({ id: s.id, name: s.name, programPath: s.programPath }));
}

/**
 * Fetch a single agent (soul) by ID.
 */
export function getAgent(id: string): AgentRecord | undefined {
  const store = getGlobalSoulStore();
  const s = store.get(id);
  if (!s) return undefined;
  return { id: s.id, name: s.name, programPath: s.programPath };
}

/**
 * If an id is provided, returns it directly.
 * Otherwise fetches agent list and prompts the user to select one.
 * For lists larger than 10, paginates with next / previous options.
 */
export async function resolveAgentId(id?: string): Promise<string> {
  if (id) return id;

  const agents = fetchAgents();

  if (agents.length === 0) {
    throw new Error('No agents found. Create one first via "gneol-cli agent create".');
  }

  // Dynamic import because @clack/prompts is ESM-only
  const { select } = await import('@clack/prompts');

  // No pagination needed — show all at once
  if (agents.length <= PAGE_SIZE) {
    const selected = await select({
      message: 'Select an agent:',
      options: agents.map(a => ({
        label: a.name || a.id,
        value: a.id,
      })),
    });
    if (typeof selected !== 'string') {
      throw new Error('Agent selection cancelled.');
    }
    return selected;
  }

  // Pagination loop
  const totalPages = Math.ceil(agents.length / PAGE_SIZE);
  let currentPage = 0;

  while (true) {
    const offset = currentPage * PAGE_SIZE;
    const pageAgents = agents.slice(offset, offset + PAGE_SIZE);

    const options: { label: string; value: string }[] = [];

    if (currentPage > 0) {
      options.push({ label: '← Previous page', value: '__prev' });
    }

    for (const a of pageAgents) {
      options.push({ label: a.name || a.id, value: a.id });
    }

    if (offset + PAGE_SIZE < agents.length) {
      options.push({ label: 'Next page →', value: '__next' });
    }

    options.push({ label: 'Cancel', value: '__cancel' });

    const selected = await select({
      message: `Select an agent (page ${currentPage + 1} of ${totalPages}):`,
      options,
    });

    if (selected === '__prev') {
      currentPage--;
      continue;
    }
    if (selected === '__next') {
      currentPage++;
      continue;
    }
    if (selected === '__cancel' || typeof selected !== 'string') {
      throw new Error('Agent selection cancelled.');
    }
    return selected;
  }
}
