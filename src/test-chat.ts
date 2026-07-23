import * as readline from 'readline';
import { RPCClient } from './rpc.client.js';

const api = new RPCClient('http://localhost:3999', async () => '', async (socket) => {

  socket.off('message', onMessage);
  socket.on('message', onMessage);
});

const onMessage = (data: any) => {
  console.log(`\n-- { ${data.data}`);
}

const onPermission = (data: any) => {
  console.log(data.data)
  api.GneolServer.approveFunction(data.data.pId, true, '');
}



// api.GneolServer.approveFunction(data.data.pId, data.data.method, true, '');

async function main() {
  let soulId = process.argv[2];
  const programPath = process.argv[3] || 'full-test.gneol';

  // If no soulId provided, deploy the program
  if (!soulId) {
    console.log('Deploying program...');
    const deployResult: any = await (api as any).GneolServer.deploy(programPath);
    soulId = deployResult.data?.soulId || deployResult.soulId;
    console.log(`Soul ID: ${soulId}\n`);
  }

  console.log('Chat CLI started. Type your messages (type "quit" or "exit" to stop).\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const msg = line.trim();
    if (!msg) {
      rl.prompt();
      return;
    }
    if (msg.toLowerCase() === 'quit' || msg.toLowerCase() === 'exit') {
      console.log('Goodbye.');
      rl.close();
      process.exit(0);
    }

    try {
      const result: any = await (api as any).GneolServer.chat(soulId, msg);
      if (result.status === 'success') {
        console.log('[Message sent]');
      } else {
        console.log('Error:', result.data);
      }
    } catch (err: any) {
      console.log('Error:', err.message);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
