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

// setTimeout(async () => {
//     try {
//         // const response = await ProgramToolManager.invokeTool(
//         //     { function: 'tool.CustomTool.testFunction', arguments: { token: 'SecretToken' } },
//         //     'gneol_soul_5133bea4-e263-4575-9a3c-261fb13e2943'
//         // )
//         const response = await appInvokationHandler.invoke(
//             'gneol_soul_5133bea4-e263-4575-9a3c-261fb13e2943',
//             'Internal.keepQuiet', {},
//         )
//         console.log(response, 'value or response oh');
//     } catch (error) {
//         console.log(error)
//     }
//     console.log('invoked oh')
// }, 10000)

export const onAuthEvent = async (args, type) => {
    const store = getGlobalSoulStore();
    const pId = `${type}.${args.permission.method}.${args.permission.pId}`;
    const soul = store.get(args.id);
    await ttc.io(soul._scid)?.emit('message', {
        id: soul.id,
        event: 'permission',
        data: {
            ...args.permission,
            pId
        }
    });
    // ProgramToolManager.approveFunction(pId, true, '');
}



