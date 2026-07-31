// Secrets UI – interactive paginated list, then update/delete per secret
import { showPrompt, text, confirm } from '../utils/prompt.js';
import { api } from '../../cli-utils/api.js';
import { rpcResponseType } from '../../rpc.client.js';
import { pushSystemMessage } from '../interface/chat.js';

const PAGE_SIZE = 5;

/**
 * Main entry – `/secrets` command.
 * Lists all secret names (paginated). Selecting one lets you update or delete.
 */
export async function showSecretsList(): Promise<void> {
  try {
    const res: rpcResponseType<{ keys: string[] }> = await api.GneolServer.listSecrets();
    // pushSystemMessage(JSON.stringify(res.data));
    if (res.status === 'error') {
      console.log(`Error: ${res.data}`);
      return;
    }

    const allKeys: string[] = (res.data as any) || [];
    if (allKeys.length === 0) {
      console.log('No secrets stored.');
      const wantAdd = await confirm('Would you like to add one?');
      if (wantAdd) {
        await addSecret();
        return showSecretsList();
      }
      return;
    }

    let page = 0;
    const totalPages = Math.ceil(allKeys.length / PAGE_SIZE);

    while (true) {
      const start = page * PAGE_SIZE;
      const chunk = allKeys.slice(start, start + PAGE_SIZE);

      const options: { label: string; value: string }[] = chunk.map(k => ({
        label: k,
        value: k
      }));

      if (page > 0) options.push({ label: '← Previous page', value: '__prev' });
      if (page < totalPages - 1) options.push({ label: 'Next page →', value: '__next' });
      options.push({ label: '✚ Add new secret', value: '__add' });
      options.push({ label: 'Back', value: '__back' });

      const header = totalPages > 1
        ? `Secrets (page ${page + 1}/${totalPages}):`
        : 'Secrets:';

      const choice = await showPrompt({ message: header, options });
      if (!choice || choice === '__back') return;

      if (choice === '__prev') { page--; continue; }
      if (choice === '__next') { page++; continue; }
      if (choice === '__add') {
        await addSecret();
        return showSecretsList();
      }

      // User selected a secret – show actions
      await secretActions(choice);
      // After action, re-fetch and refresh the list
      return showSecretsList();
    }
  } catch (err: any) {
    console.log(`Failed to list secrets: ${err.message}`);
  }
}

/** Show update / delete options for a single secret */

/** Prompt for a new secret name and value, then store it */
async function addSecret(): Promise<void> {
  const name = await text('Enter secret name:');
  if (!name) return;
  const value = await text(`Enter value for "${name}":`);
  if (!value) return;

  try {
    const res = await api.GneolServer.storeSecret(name, value);
    if (res.status === 'error') {
      console.log(`Error: ${res.data}`);
    } else {
      console.log(`✅ Secret "${name}" stored.`);
    }
  } catch (err: any) {
    console.log(`Failed to store secret: ${err.message}`);
  }
}


async function secretActions(name: string): Promise<void> {
  while (true) {
    const action = await showPrompt({
      message: `Secret: ${name}`,
      options: [
        { label: 'Update value', value: 'update' },
        { label: 'Delete this secret', value: 'delete' },
        { label: 'Back to list', value: 'back' }
      ]
    });

    if (!action || action === 'back') return;

    if (action === 'update') {
      const value = await text(`Enter new value for "${name}":`);
      if (!value) continue;

      try {
        const res = await api.GneolServer.storeSecret(name, value);
        if (res.status === 'error') {
          console.log(`Error: ${res.data}`);
        } else {
          console.log(`✅ Secret "${name}" updated.`);
          return;
        }
      } catch (err: any) {
        console.log(`Failed to update: ${err.message}`);
      }
    }

    if (action === 'delete') {
      const ok = await confirm(`Delete secret "${name}"? This cannot be undone.`);
      if (!ok) continue;

      try {
        const res = await api.GneolServer.removeSecret(name);
        if (res.status === 'error') {
          console.log(`Error: ${res.data}`);
        } else {
          console.log(`✅ Secret "${name}" deleted.`);
          return;
        }
      } catch (err: any) {
        console.log(`Failed to delete: ${err.message}`);
      }
    }
  }
}