// Tools UI – manages custom program tools via Assistant's program.tools CRUD
import { confirm, text, showPrompt } from '../utils/prompt.js';
import { current } from '../interface/chat.js';

async function getTools() {
  if (!current) {
    console.log('No active assistant.');
    return null;
  }
  return current.program.tools;
}

export async function listTools() {
  const tools = await getTools();
  if (!tools) return;

  const items = await tools.list();
  if (items.length === 0) {
    console.log('No tools configured.');
    return;
  }

  const options = items.map(t => ({
    label: `${t.name}${t.description ? ` - ${t.description.slice(0, 40)}` : ''}`,
    value: t.resourceId
  }));

  const selected = await showPrompt({
    message: 'Select a tool:',
    options
  });

  return selected ? items.find(t => t.resourceId === selected) : null;
}

export async function createTool() {
  const tools = await getTools();
  if (!tools) return;

  const name = await text('Enter tool name:');
  if (!name) return;

  const description = await text('Enter description (optional):', { defaultValue: '' });
  const script = await text('Enter path to script (optional):', { defaultValue: '' });

  const payload: any = { name };
  if (description.trim()) payload.description = description.trim();
  if (script.trim()) payload.script = script.trim();

  await tools.create(payload);
  console.log(`Tool "${name}" created.`);
}

export async function viewTool(name?: string) {
  const tools = await getTools();
  if (!tools) return;

  const item = name ? (await tools.list()).find(t => t.name === name) : await listTools();
  if (!item) {
    console.log('Tool not found.');
    return;
  }

  console.log('\n--- Tool Details ---');
  console.log(`Name: ${item.name}`);
  console.log(`Description: ${item.description || '(none)'}`);
  console.log(`Script: ${item.script || '(none)'}`);
  console.log('---------------------');
}

export async function editTool(name?: string) {
  const tools = await getTools();
  if (!tools) return;

  const item = name ? (await tools.list()).find(t => t.name === name) : await listTools();
  if (!item) {
    console.log('Tool not found.');
    return;
  }

  const description = await text('Enter new description (optional):', {
    defaultValue: item.description || ''
  });
  const script = await text('Enter new script path (optional):', {
    defaultValue: item.script || ''
  });

  const updates: any = {};
  if (description.trim() !== (item.description || '')) updates.description = description.trim();
  if (script.trim() !== (item.script || '')) updates.script = script.trim();

  if (Object.keys(updates).length > 0) {
    await tools.update(item.resourceId, updates);
    console.log(`Tool "${item.name}" updated.`);
  } else {
    console.log('No changes made.');
  }
}

export async function deleteTool(name?: string) {
  const tools = await getTools();
  if (!tools) return;

  const item = name ? (await tools.list()).find(t => t.name === name) : await listTools();
  if (!item) {
    console.log('Tool not found.');
    return;
  }

  const confirmed = await confirm(`Delete tool "${item.name}"?`);
  if (confirmed) {
    await tools.delete(item.resourceId);
    console.log(`Tool "${item.name}" deleted.`);
  } else {
    console.log('Deletion cancelled.');
  }
}