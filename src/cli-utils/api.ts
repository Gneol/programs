import { RPCClient } from '../rpc.client.js';


export const api = new RPCClient('http://localhost:3999', async () => '', async (socket)=> {

    socket.on('message', (data) => {
        console.log(data);
    })
});
