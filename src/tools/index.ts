import { serverLocalModules } from "gneol-sdk";
import { FileModule } from "./file";
import { Internal } from "./internal";
import { CliModule } from "./cli";
import { getGlobalSoulStore } from "../db/program";
import { ttc } from "ttc-rpc";



const tools = [FileModule, Internal, CliModule];
export const appFunctions = (tools.map(t => t.methodDoc().definitions)).flat();
export const appInvokationHandler = serverLocalModules(tools)

// setTimeout(()=>{
//     appInvokationHandler.invoke('gneol_soul_1cbb4f0a-0037-4c11-9fb4-dd90ff551e3d', 'Cli.execute', {command: 'pwd'})

// }, 4000)
appInvokationHandler.on('auth', (args)=> {
    console.log(args)
    const store = getGlobalSoulStore();
    const soul = store.get(args.id);
    ttc.io(soul._scid)?.emit('permission', {
        id: soul.id,
        event: 'permission',
        data: args.permission
    })
})


