import { serverLocalModules } from "gneol-sdk";
import { FileModule } from "./file";
import { Internal } from "./internal";
import { CliModule } from "./cli";
import { getGlobalSoulStore } from "../db/program";
import { ttc } from "ttc-rpc";
import { ProgramToolManager } from "./utils/ProgramToolManager";



const tools = [FileModule, Internal, CliModule];
export const appFunctions = (tools.map(t => t.methodDoc().definitions)).flat();
export const appInvokationHandler = serverLocalModules(tools)

// setTimeout(async ()=>{
//     try {
//         const response = await appInvokationHandler.invoke(
//             'gneol_soul_1cbb4f0a-0037-4c11-9fb4-dd90ff551e3d',
//             'Cli.execute',
//             {command: 'rm dad_joke.txt'}
//         )
//         // console.log(response, 'value or response oh');
//     } catch (error) {
//         console.log(error)
//     }
//     console.log('invoked oh')
// }, 5000)

export const onAuthEvent = (args, type)=> {
    const store = getGlobalSoulStore();
    const pId = `${type}.${args.permission.method}.${args.permission.pId}`;
    const soul = store.get(args.id);
    ttc.io(soul._scid)?.emit('permission', {
        id: soul.id,
        event: 'permission',
        type,
        data: {
            ...args.permission,
            pId
        }
    })
}



